import {
  computeSettlement,
  MONEY_MESSAGES,
  type As,
  type PartyRef,
  findSettlementTransition,
  settlementActionSides,
  type SettlementAction,
  type SettlementDetail,
  type SettlementInput,
  type SettlementPreview,
  type SettlementSide,
} from '@stylus/shared'
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Db } from '../db/client'
import { billEvents, bills, members, settlements } from '../db/schema'
import type { Member } from '../env'
import { fail, failInput } from '../errors'
import { partyIs, settlementSidesOf, type PartyId } from './parties'
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

export const SETTLEMENT_NOT_FOUND = 'この精算は見つかりません'

type SettlementRecord = typeof settlements.$inferSelect

// 精算を読み、関係者でなければ（無ければ）404 not_found（MONEY-N-001）
async function loadRelatedSettlement(
  db: Executor,
  member: Member,
  id: string,
): Promise<{ settlement: SettlementRecord; sides: SettlementSide[] }> {
  const [settlement] = await db.select().from(settlements).where(eq(settlements.id, id))
  const sides = settlement
    ? settlementSidesOf(member, settlement.payerMemberId, settlement.receiverMemberId)
    : []
  if (!settlement || sides.length === 0) fail(404, 'not_found', SETTLEMENT_NOT_FOUND)
  return { settlement, sides }
}

// 精算に含まれた請求の ID（戻した後も経過から分かる）
async function settlementBillIds(db: Executor, id: string): Promise<string[]> {
  const rows = await db
    .select({ billId: billEvents.billId })
    .from(billEvents)
    .where(and(eq(billEvents.settlementId, id), eq(billEvents.kind, 'settled_paid')))
  return rows.map((r) => r.billId)
}

const payer = alias(members, 'payer')
const receiver = alias(members, 'receiver')
const paidBy = alias(members, 'paid_by')
const confirmedBy = alias(members, 'confirmed_by')
const revertedBy = alias(members, 'reverted_by')

// 精算の中身（MONEY-F-012）
export async function loadSettlementDetail(
  db: Executor,
  member: Member,
  id: string,
): Promise<SettlementDetail> {
  const { sides } = await loadRelatedSettlement(db, member, id)
  const [row] = await db
    .select({
      s: settlements,
      payerName: payer.displayName,
      receiverName: receiver.displayName,
      paidByName: paidBy.displayName,
      confirmedByName: confirmedBy.displayName,
      revertedByName: revertedBy.displayName,
    })
    .from(settlements)
    .leftJoin(payer, eq(settlements.payerMemberId, payer.id))
    .leftJoin(receiver, eq(settlements.receiverMemberId, receiver.id))
    .innerJoin(paidBy, eq(settlements.paidBy, paidBy.id))
    .leftJoin(confirmedBy, eq(settlements.confirmedBy, confirmedBy.id))
    .leftJoin(revertedBy, eq(settlements.revertedBy, revertedBy.id))
    .where(eq(settlements.id, id))
  if (!row) fail(404, 'not_found', SETTLEMENT_NOT_FOUND)

  const ids = await settlementBillIds(db, id)
  const billRows =
    ids.length === 0
      ? []
      : await selectBillRows(db)
          .where(inArray(bills.id, ids))
          .orderBy(desc(bills.occurredOn), desc(bills.createdAt))
  const { s } = row
  return {
    id: s.id,
    payer: partyOf(s.payerMemberId, row.payerName),
    receiver: partyOf(s.receiverMemberId, row.receiverName),
    amount: s.amount,
    status: s.status,
    paidByName: row.paidByName,
    paidAt: s.paidAt.toISOString(),
    confirmedByName: row.confirmedByName,
    confirmedAt: s.confirmedAt?.toISOString() ?? null,
    revertedByName: row.revertedByName,
    revertedAt: s.revertedAt?.toISOString() ?? null,
    bills: billRows.map(toBillSummary),
    sides,
  }
}

// 精算の操作（まとめて受け取った・精算ごと戻す）。精算と含まれる請求を1つのトランザクションで更新する
// 精算の状態を条件にした更新で、二重の操作を防ぐ
export async function operateSettlement(
  db: Db,
  member: Member,
  id: string,
  action: SettlementAction,
  now: Date,
): Promise<SettlementDetail> {
  const { settlement, sides } = await loadRelatedSettlement(db, member, id)

  const allowedSides = settlementActionSides(action)
  const mySides = sides.filter((s) => allowedSides.includes(s))
  if (mySides.length === 0) fail(403, 'forbidden', 'この操作をする権限がありません')

  const side = mySides.find((s) => findSettlementTransition(action, s, settlement.status))
  const transition = side && findSettlementTransition(action, side, settlement.status)
  if (!transition) fail(409, 'state_changed', SETTLEMENT_CHANGED)

  await db.transaction(async (tx) => {
    const stamp =
      transition.to === 'confirmed'
        ? { confirmedBy: member.id, confirmedAt: now }
        : { revertedBy: member.id, revertedAt: now }
    const updated = await tx
      .update(settlements)
      .set({ status: transition.to, ...stamp })
      .where(and(eq(settlements.id, id), eq(settlements.status, settlement.status)))
      .returning({ id: settlements.id })
    if (updated.length === 0) fail(409, 'state_changed', SETTLEMENT_CHANGED)

    // 含まれる請求：受け取ったなら確認済に、戻すなら請求中に戻して精算から外す
    const changed = await tx
      .update(bills)
      .set(
        transition.to === 'confirmed'
          ? { status: 'confirmed', version: sql`${bills.version} + 1`, updatedAt: now }
          : {
              status: 'requested',
              settlementId: null,
              version: sql`${bills.version} + 1`,
              updatedAt: now,
            },
      )
      .where(and(eq(bills.settlementId, id), eq(bills.status, 'paid')))
      .returning({ id: bills.id })

    if (changed.length > 0) {
      await tx.insert(billEvents).values(
        changed.map(({ id: billId }) => ({
          billId,
          kind: transition.event,
          actorMemberId: member.id,
          settlementId: id,
          createdAt: now,
        })),
      )
    }
  })
  return loadSettlementDetail(db, member, id)
}
