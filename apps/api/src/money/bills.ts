import { MONEY_MESSAGES, type BillSummary, type createBillInputSchema } from '@stylus/shared'
import { and, eq } from 'drizzle-orm'
import type { z } from 'zod'
import type { Db } from '../db/client'
import { billCategories, billEvents, bills, members } from '../db/schema'
import type { Member } from '../env'
import { fail, failInput } from '../errors'
import { PG, pgErrorCode } from '../validate'
import { selectBillRows, toBillSummary, type Executor } from './summaries'

export type BillCreateInput = z.output<ReturnType<typeof createBillInputSchema>>

// 請求を登録する（MONEY-F-001）。請求中で保存し、経過「登録」を足す
// 判定の順（tasks.md D-2）：形の検証（ルートの jsonBody で 400）→ 名義の権限（403）→ 組み合わせ・相手の実在（400）
export async function createBill(
  db: Db,
  member: Member,
  input: BillCreateInput,
  now: Date,
): Promise<BillSummary> {
  if (input.as === 'household' && !member.isParent) {
    fail(403, 'forbidden', '「家庭」として請求できるのは親だけです')
  }
  const fromMemberId = input.as === 'household' ? null : member.id
  const toMemberId = input.to === 'household' ? null : input.to
  await checkParties(db, member, fromMemberId, toMemberId)
  await checkCategory(db, input.categoryId)

  try {
    return await insertBill(db, member, input, fromMemberId, toMemberId, now)
  } catch (error) {
    const code = pgErrorCode(error)
    // 判定の後、登録の直前にカテゴリーが削除された（MONEY-F-001/AC-11）
    if (code === PG.FOREIGN_KEY_VIOLATION) {
      failInput({ categoryId: MONEY_MESSAGES.categoryNotFound })
    }
    // 同じ request_id の登録がすでにある（二重登録。design.md「同時の操作」）
    if (code === PG.UNIQUE_VIOLATION) {
      return sameRequestBill(db, member, input, fromMemberId, toMemberId)
    }
    throw error
  }
}

// 中身が同じならすでにある請求を返し（MONEY-F-001/AC-14）、違えば 409（AC-16。直した中身を黙って捨てない）
async function sameRequestBill(
  db: Db,
  member: Member,
  input: BillCreateInput,
  fromMemberId: string | null,
  toMemberId: string | null,
): Promise<BillSummary> {
  const [existing] = await db
    .select()
    .from(bills)
    .where(and(eq(bills.createdBy, member.id), eq(bills.requestId, input.requestId)))
  if (!existing) throw new Error('一意の制約の違反なのに、同じ request_id の請求が無い')
  const same =
    existing.fromMemberId === fromMemberId &&
    existing.toMemberId === toMemberId &&
    existing.amount === input.amount &&
    existing.categoryId === input.categoryId &&
    existing.title === input.title &&
    existing.memo === input.memo &&
    existing.occurredOn === input.occurredOn
  if (!same) {
    fail(
      409,
      'already_registered',
      'この請求はすでに登録されています。一覧で確かめて、必要なら直してください。',
    )
  }
  return loadBillSummary(db, existing.id)
}

// 請求する側と請求先の組み合わせ（MONEY-F-001 の対象外の入力）
async function checkParties(
  db: Db,
  member: Member,
  fromMemberId: string | null,
  toMemberId: string | null,
) {
  if (toMemberId === null) {
    // 親は「家庭」宛てにできない（「家庭」から「家庭」も同じ）
    if (member.isParent) failInput({ to: '親は「家庭」に請求できません' })
    return
  }
  if (toMemberId === member.id) failInput({ to: '自分には請求できません' })
  const [to] = await db
    .select({ isParent: members.isParent })
    .from(members)
    .where(eq(members.id, toMemberId))
  if (!to) failInput({ to: MONEY_MESSAGES.reselect })
  // 「家庭」の請求先は息子だけ
  if (fromMemberId === null && to.isParent) failInput({ to: '「家庭」の請求先は息子だけです' })
}

async function checkCategory(db: Db, categoryId: string) {
  const [category] = await db
    .select({ id: billCategories.id })
    .from(billCategories)
    .where(eq(billCategories.id, categoryId))
  if (!category) failInput({ categoryId: MONEY_MESSAGES.categoryNotFound })
}

async function insertBill(
  db: Db,
  member: Member,
  input: BillCreateInput,
  fromMemberId: string | null,
  toMemberId: string | null,
  now: Date,
): Promise<BillSummary> {
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
    await tx
      .insert(billEvents)
      .values({ billId, kind: 'created', actorMemberId: member.id, createdAt: now })
    return billId
  })
  return loadBillSummary(db, id)
}

export async function loadBillSummary(db: Executor, id: string): Promise<BillSummary> {
  const [row] = await selectBillRows(db).where(eq(bills.id, id))
  if (!row) throw new Error(`請求 ${id} が無い`)
  return toBillSummary(row)
}
