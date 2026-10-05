import type { BillDetail, BillSide } from '@stylus/shared'
import { asc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { billEvents, bills, members, settlements } from '../db/schema'
import type { Member } from '../env'
import { fail } from '../errors'
import { billSidesOf } from './parties'
import { partyOf, selectBillRows, toBillSummary, type Executor } from './summaries'

export const BILL_NOT_FOUND = 'この請求は見つかりません'

export type BillRecord = typeof bills.$inferSelect

// 請求を読み、関係者でなければ（無ければ）404 not_found（MONEY-N-001）。操作のルートが最初に使う
export async function loadRelatedBill(
  db: Executor,
  member: Member,
  id: string,
): Promise<{ bill: BillRecord; sides: BillSide[] }> {
  const [bill] = await db.select().from(bills).where(eq(bills.id, id))
  const sides = bill ? billSidesOf(member, bill.fromMemberId, bill.toMemberId) : []
  if (!bill || sides.length === 0) fail(404, 'not_found', BILL_NOT_FOUND)
  return { bill, sides }
}

const actor = alias(members, 'actor')
const payer = alias(members, 'payer')
const receiver = alias(members, 'receiver')

// 請求の中身と経過（MONEY-F-005）
export async function loadBillDetail(
  db: Executor,
  member: Member,
  id: string,
): Promise<BillDetail> {
  const { sides } = await loadRelatedBill(db, member, id)
  const [row] = await selectBillRows(db).where(eq(bills.id, id))
  if (!row) fail(404, 'not_found', BILL_NOT_FOUND)

  const events = await db
    .select({
      kind: billEvents.kind,
      actorName: actor.displayName,
      reason: billEvents.reason,
      createdAt: billEvents.createdAt,
      settlementId: settlements.id,
      settlementAmount: settlements.amount,
      payerMemberId: settlements.payerMemberId,
      payerName: payer.displayName,
      receiverMemberId: settlements.receiverMemberId,
      receiverName: receiver.displayName,
    })
    .from(billEvents)
    .innerJoin(actor, eq(billEvents.actorMemberId, actor.id))
    .leftJoin(settlements, eq(billEvents.settlementId, settlements.id))
    .leftJoin(payer, eq(settlements.payerMemberId, payer.id))
    .leftJoin(receiver, eq(settlements.receiverMemberId, receiver.id))
    .where(eq(billEvents.billId, id))
    .orderBy(asc(billEvents.createdAt), asc(billEvents.seq))

  return {
    ...toBillSummary(row),
    memo: row.memo,
    sides,
    events: events.map((e) => ({
      kind: e.kind,
      actorName: e.actorName,
      reason: e.reason,
      createdAt: e.createdAt.toISOString(),
      settlement:
        e.settlementId === null || e.settlementAmount === null
          ? null
          : {
              id: e.settlementId,
              amount: e.settlementAmount,
              payer: partyOf(e.payerMemberId, e.payerName),
              receiver: partyOf(e.receiverMemberId, e.receiverName),
            },
    })),
  }
}
