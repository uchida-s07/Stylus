import {
  computeSettlement,
  MONEY_MESSAGES,
  type As,
  type PartyRef,
  type SettlementInput,
  type SettlementPreview,
} from '@stylus/shared'
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { billEvents, bills, members, settlements } from '../db/schema'
import type { Member } from '../env'
import { fail, failInput } from '../errors'
import { partyIs, type PartyId } from './parties'
import { partyOf, selectBillRows, toBillSummary, type BillRow, type Executor } from './summaries'

// 精算の2者（名義の側 self と相手 counterpart）
export type SettlementPair = {
  self: PartyId
  selfName: string | null
  counterpart: PartyId
  counterpartName: string | null
}

// 名義と相手から2者を決める（MONEY-F-010）
// 判定の順（tasks.md D-2）：形の検証（400）→ 名義の権限（403）→ 組み合わせ・相手の実在（400）
export async function resolvePair(
  db: Executor,
  member: Member,
  as: As,
  counterpartRef: PartyRef,
): Promise<SettlementPair> {
  if (as === 'household' && !member.isParent) {
    fail(403, 'forbidden', '「家庭」として精算できるのは親だけです')
  }
  const self = as === 'household' ? null : member.id
  const selfName = as === 'household' ? null : member.displayName

  if (counterpartRef === 'household') {
    // 「家庭」と「家庭」、親と「家庭」の間には請求ができない
    if (member.isParent) failInput({ counterpart: '親は「家庭」を相手に選べません' })
    return { self, selfName, counterpart: null, counterpartName: null }
  }
  if (counterpartRef === member.id) failInput({ counterpart: '自分は相手に選べません' })
  const [counterpart] = await db
    .select({ displayName: members.displayName, isParent: members.isParent })
    .from(members)
    .where(eq(members.id, counterpartRef))
  if (!counterpart) failInput({ counterpart: MONEY_MESSAGES.reselect })
  if (self === null && counterpart.isParent) {
    failInput({ counterpart: '「家庭」の名義では父・母を相手に選べません' })
  }
  return { self, selfName, counterpart: counterpartRef, counterpartName: counterpart.displayName }
}

// 2者の間の請求中の請求（両方向）
export function selectPairBills(db: Executor, pair: SettlementPair) {
  const { self, counterpart } = pair
  return selectBillRows(db)
    .where(
      and(
        eq(bills.status, 'requested'),
        or(
          and(partyIs(bills.fromMemberId, self), partyIs(bills.toMemberId, counterpart)),
          and(partyIs(bills.fromMemberId, counterpart), partyIs(bills.toMemberId, self)),
        ),
      ),
    )
    .orderBy(desc(bills.occurredOn), desc(bills.createdAt))
}

export function settle(pair: SettlementPair, rows: readonly BillRow[]) {
  return computeSettlement(
    rows.map((r) => ({ amount: r.amount, requestedBySelf: r.fromMemberId === pair.self })),
  )
}

// 精算額（MONEY-F-010）
export async function previewSettlement(
  db: Executor,
  member: Member,
  as: As,
  counterpart: PartyRef,
): Promise<SettlementPreview> {
  const pair = await resolvePair(db, member, as, counterpart)
  const rows = await selectPairBills(db, pair)
  return {
    self: partyOf(pair.self, pair.selfName),
    counterpart: partyOf(pair.counterpart, pair.counterpartName),
    bills: rows.map(toBillSummary),
    ...settle(pair, rows),
  }
}

export const SETTLEMENT_CHANGED = '精算の中身が変わりました。もう一度確かめてください。'

// まとめて払った（MONEY-F-011。design.md「同時の操作」、tasks.md D-3）
// 1. 2者の間の請求中の請求を FOR UPDATE で読む → 2. 送られた { id, version } と完全に一致するか
// → 3. 精算額と払う側を計算し直して一致するか → 4. 精算を足す → 5. 請求をまとめて支払済に → 6. 経過
// 全部が成功するか、何も変わらないかのどちらか
export async function createSettlement(
  db: Db,
  member: Member,
  input: SettlementInput & { as: As },
  now: Date,
): Promise<{ id: string }> {
  const pair = await resolvePair(db, member, input.as, input.counterpart)
  // 画面が「相手が払う」と見ていたなら、押した人は受け取る側
  if (input.payer === 'counterpart')
    fail(403, 'forbidden', '受け取る側は「まとめて払った」にできません')

  return db.transaction(async (tx) => {
    const rows = await selectPairBills(tx, pair).for('update', { of: bills })

    const sent = new Map(input.bills.map((b) => [b.id, b.version]))
    const same = rows.length === sent.size && rows.every((r) => sent.get(r.id) === r.version)
    if (!same) fail(409, 'state_changed', SETTLEMENT_CHANGED)

    const result = settle(pair, rows)
    // 差し引き 0円 なら押した側が払う側
    const payer = result.payer ?? 'self'
    if (result.amount !== input.amount || payer !== input.payer) {
      fail(409, 'state_changed', SETTLEMENT_CHANGED)
    }

    const [settlement] = await tx
      .insert(settlements)
      .values({
        payerMemberId: pair.self,
        receiverMemberId: pair.counterpart,
        amount: result.amount,
        paidBy: member.id,
        paidAt: now,
      })
      .returning({ id: settlements.id })
    const settlementId = (settlement as { id: string }).id
    const ids = rows.map((r) => r.id)

    const updated = await tx
      .update(bills)
      .set({ status: 'paid', settlementId, version: sql`${bills.version} + 1`, updatedAt: now })
      .where(and(inArray(bills.id, ids), eq(bills.status, 'requested')))
      .returning({ id: bills.id })
    if (updated.length !== ids.length) fail(409, 'state_changed', SETTLEMENT_CHANGED)

    await tx.insert(billEvents).values(
      ids.map((billId) => ({
        billId,
        kind: 'settled_paid' as const,
        actorMemberId: member.id,
        settlementId,
        createdAt: now,
      })),
    )
    return { id: settlementId }
  })
}
