import type { BillSummary, createBillInputSchema } from '@stylus/shared'
import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import type { Db } from '../db/client'
import { billEvents, bills } from '../db/schema'
import type { Member } from '../env'
import { selectBillRows, toBillSummary, type Executor } from './summaries'

export type BillCreateInput = z.output<ReturnType<typeof createBillInputSchema>>

// 請求を登録する（MONEY-F-001）。請求中で保存し、経過「登録」を足す
export async function createBill(
  db: Db,
  member: Member,
  input: BillCreateInput,
): Promise<BillSummary> {
  const fromMemberId = input.as === 'household' ? null : member.id
  const toMemberId = input.to === 'household' ? null : input.to

  const id = await db.transaction(async (tx) => {
    const [bill] = await tx
      .insert(bills)
      .values({
        fromMemberId,
        toMemberId,
        amount: input.amount,
        categoryId: input.categoryId,
        title: input.title,
        memo: input.memo,
        occurredOn: input.occurredOn,
        createdBy: member.id,
        requestId: input.requestId,
      })
      .returning({ id: bills.id })
    const billId = (bill as { id: string }).id
    await tx.insert(billEvents).values({ billId, kind: 'created', actorMemberId: member.id })
    return billId
  })
  return loadBillSummary(db, id)
}

export async function loadBillSummary(db: Executor, id: string): Promise<BillSummary> {
  const [row] = await selectBillRows(db).where(eq(bills.id, id))
  if (!row) throw new Error(`請求 ${id} が無い`)
  return toBillSummary(row)
}
