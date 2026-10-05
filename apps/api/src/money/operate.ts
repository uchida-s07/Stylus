import {
  billActionSides,
  findBillTransition,
  type BillAction,
  type BillDetail,
} from '@stylus/shared'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { billEvents, bills } from '../db/schema'
import type { Member } from '../env'
import { fail } from '../errors'
import { loadBillDetail, loadRelatedBill } from './load'

export const STATE_CHANGED = '請求の状態が変わりました。もう一度開いてください。'

// 操作と一緒に変える列（直すときの中身）
export type BillChanges = Partial<
  Pick<typeof bills.$inferInsert, 'amount' | 'categoryId' | 'title' | 'memo' | 'occurredOn'>
>

type OperateOptions = {
  // 画面が見ていた版（ADR-0008）
  version: number
  now: Date
  // 差し戻しの理由
  reason?: string
  changes?: BillChanges
}

// 1件の操作（design.md「同時の操作」）
// 1. 関係者でなければ 404 → 2. 側が違えば 403 → 3. 状態遷移の表で行えなければ 409 → 4. 版つきの条件付き更新と経過を1つのトランザクションで
export async function operateBill(
  db: Db,
  member: Member,
  id: string,
  action: BillAction,
  options: OperateOptions,
): Promise<BillDetail> {
  const { bill, sides } = await loadRelatedBill(db, member, id)

  const allowedSides = billActionSides(action)
  const mySides = sides.filter((s) => allowedSides.includes(s))
  if (mySides.length === 0) fail(403, 'forbidden', 'この操作をする権限がありません')

  const inSettlement = bill.settlementId !== null
  const side = mySides.find((s) => findBillTransition(action, s, bill.status, inSettlement))
  const transition = side && findBillTransition(action, side, bill.status, inSettlement)
  if (!transition) fail(409, 'state_changed', STATE_CHANGED)

  await db.transaction(async (tx) => {
    // 読んだ後に別の人が状態か中身を変えていれば0行になる
    const updated = await tx
      .update(bills)
      .set({
        ...options.changes,
        status: transition.to,
        version: sql`${bills.version} + 1`,
        updatedAt: options.now,
      })
      .where(
        and(
          eq(bills.id, id),
          eq(bills.status, bill.status),
          eq(bills.version, options.version),
          isNull(bills.settlementId),
        ),
      )
      .returning({ id: bills.id })
    if (updated.length === 0) fail(409, 'state_changed', STATE_CHANGED)

    await tx.insert(billEvents).values({
      billId: id,
      kind: transition.event,
      actorMemberId: member.id,
      reason: options.reason ?? null,
      createdAt: options.now,
    })
  })
  return loadBillDetail(db, member, id)
}
