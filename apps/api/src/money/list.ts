import type { BillListResponse } from '@stylus/shared'
import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client'
import { bills, members, settlements } from '../db/schema'
import type { Member } from '../env'
import { relatedTo, settlementSidesOf } from './parties'
import { partyOf, selectBillRows, toBillSummary } from './summaries'
import { alias } from 'drizzle-orm/pg-core'

const OPEN_STATUSES = ['requested', 'returned', 'paid'] as const
const CLOSED_STATUSES = ['confirmed', 'canceled'] as const

// 自分が関係する請求の一覧（MONEY-F-004、MONEY-N-001）
export async function listBills(
  db: Db,
  member: Member,
  view: 'open' | 'closed',
): Promise<BillListResponse> {
  const rows = await selectBillRows(db)
    .where(
      and(
        relatedTo(member, bills.fromMemberId, bills.toMemberId),
        inArray(bills.status, view === 'open' ? [...OPEN_STATUSES] : [...CLOSED_STATUSES]),
      ),
    )
    .orderBy(desc(bills.occurredOn), desc(bills.createdAt))
  return {
    bills: rows.map(toBillSummary),
    totals: await totalsOf(db, member),
    pendingSettlements: await pendingSettlementsOf(db, member),
  }
}

// 請求中の請求の合計（MONEY-F-004）。自分の分と、親には「家庭」の分
async function totalsOf(db: Db, member: Member): Promise<BillListResponse['totals']> {
  const sumWhere = (condition: SQL) =>
    sql<number>`coalesce(sum(${bills.amount}) filter (where ${condition}), 0)`.mapWith(Number)
  const [row] = await db
    .select({
      selfPay: sumWhere(eq(bills.toMemberId, member.id)),
      selfReceive: sumWhere(eq(bills.fromMemberId, member.id)),
      householdPay: sumWhere(isNull(bills.toMemberId)),
      householdReceive: sumWhere(isNull(bills.fromMemberId)),
    })
    .from(bills)
    .where(
      and(eq(bills.status, 'requested'), relatedTo(member, bills.fromMemberId, bills.toMemberId)),
    )
  const totals = row ?? { selfPay: 0, selfReceive: 0, householdPay: 0, householdReceive: 0 }
  return {
    self: { pay: totals.selfPay, receive: totals.selfReceive },
    household: member.isParent
      ? { pay: totals.householdPay, receive: totals.householdReceive }
      : null,
  }
}

const payer = alias(members, 'payer')
const receiver = alias(members, 'receiver')

// 受け取り待ちの精算（MONEY-F-004・011）。払われて、まだ受け取っていない・戻していないもの
async function pendingSettlementsOf(
  db: Db,
  member: Member,
): Promise<BillListResponse['pendingSettlements']> {
  const rows = await db
    .select({
      id: settlements.id,
      payerMemberId: settlements.payerMemberId,
      payerName: payer.displayName,
      receiverMemberId: settlements.receiverMemberId,
      receiverName: receiver.displayName,
      amount: settlements.amount,
      paidAt: settlements.paidAt,
    })
    .from(settlements)
    .leftJoin(payer, eq(settlements.payerMemberId, payer.id))
    .leftJoin(receiver, eq(settlements.receiverMemberId, receiver.id))
    .where(
      and(
        eq(settlements.status, 'paid'),
        relatedTo(member, settlements.payerMemberId, settlements.receiverMemberId),
      ),
    )
    .orderBy(desc(settlements.paidAt))
  return rows.map((r) => ({
    id: r.id,
    payer: partyOf(r.payerMemberId, r.payerName),
    receiver: partyOf(r.receiverMemberId, r.receiverName),
    amount: r.amount,
    paidAt: r.paidAt.toISOString(),
    // 受け取る側を先に見る（受け取る操作のほうが要る）
    side: settlementSidesOf(member, r.payerMemberId, r.receiverMemberId).includes('receiver')
      ? ('receiver' as const)
      : ('payer' as const),
  }))
}
