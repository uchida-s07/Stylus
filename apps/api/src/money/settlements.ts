import {
  computeSettlement,
  MONEY_MESSAGES,
  type As,
  type PartyRef,
  type SettlementPreview,
} from '@stylus/shared'
import { and, desc, eq, or } from 'drizzle-orm'
import { bills, members } from '../db/schema'
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
