import { HOUSEHOLD_NAME, type BillSummary, type Party } from '@stylus/shared'
import { eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Db } from '../db/client'
import { billCategories, bills, members } from '../db/schema'
import type { PartyId } from './parties'

// トランザクションの中でも外でも使える問い合わせの口
export type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

const fromMember = alias(members, 'from_member')
const toMember = alias(members, 'to_member')

// 請求の行（一覧の1行に要る列と、当事者・カテゴリーの名前）
export function selectBillRows(db: Executor) {
  return db
    .select({
      id: bills.id,
      fromMemberId: bills.fromMemberId,
      fromName: fromMember.displayName,
      toMemberId: bills.toMemberId,
      toName: toMember.displayName,
      amount: bills.amount,
      categoryId: billCategories.id,
      categoryName: billCategories.name,
      title: bills.title,
      memo: bills.memo,
      occurredOn: bills.occurredOn,
      status: bills.status,
      version: bills.version,
      settlementId: bills.settlementId,
      createdAt: bills.createdAt,
    })
    .from(bills)
    .innerJoin(billCategories, eq(bills.categoryId, billCategories.id))
    .leftJoin(fromMember, eq(bills.fromMemberId, fromMember.id))
    .leftJoin(toMember, eq(bills.toMemberId, toMember.id))
    .$dynamic()
}

export type BillRow = Awaited<ReturnType<typeof selectBillRows>>[number]

export function partyOf(memberId: PartyId, name: string | null): Party {
  return { memberId, name: memberId === null ? HOUSEHOLD_NAME : (name ?? '') }
}

export function toBillSummary(row: BillRow): BillSummary {
  return {
    id: row.id,
    from: partyOf(row.fromMemberId, row.fromName),
    to: partyOf(row.toMemberId, row.toName),
    amount: row.amount,
    category: { id: row.categoryId, name: row.categoryName },
    title: row.title,
    occurredOn: row.occurredOn,
    status: row.status,
    version: row.version,
    settlementId: row.settlementId,
    createdAt: row.createdAt.toISOString(),
  }
}
