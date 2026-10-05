import type { BillListResponse } from '@stylus/shared'
import { and, desc, inArray } from 'drizzle-orm'
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
    totals: { self: { pay: 0, receive: 0 }, household: null },
    pendingSettlements: [],
  }
}
