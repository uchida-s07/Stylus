import type { BillListResponse } from '@stylus/shared'
import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client'
import { bills } from '../db/schema'
import type { Member } from '../env'
import { relatedTo } from './parties'
import { selectBillRows, toBillSummary } from './summaries'

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
    pendingSettlements: [],
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
