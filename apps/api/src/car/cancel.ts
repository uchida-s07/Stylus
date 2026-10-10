import { CAR_MESSAGES, reservationPhase } from '@stylus/shared'
import { and, eq, gt } from 'drizzle-orm'
import type { Db } from '../db/client'
import { carReservations } from '../db/schema'
import type { Member } from '../env'
import { fail } from '../errors'
import { loadOwnReservation } from './update'

// 予約を取り消す（CAR-F-007。design.md「予約の状態と操作の可否」）。行を消す（残さない）
// 判定の順：予約があるか（404）→ 本人か（403）→ 使用中・終わったなら 409 state_changed → 削除
// 版は見ない（開いた後に本人がほかの端末で直していても取り消す。2026-10-07 オーナー決定）
export async function cancelReservation(db: Db, member: Member, id: string, now: Date) {
  await checkCancelable(db, member, id, now)
  // 判定と削除の間に予約が始まる場合に備えて、時刻の条件も入れる
  const deleted = await db
    .delete(carReservations)
    .where(
      and(
        eq(carReservations.id, id),
        eq(carReservations.memberId, member.id),
        gt(carReservations.startsAt, now),
      ),
    )
    .returning({ id: carReservations.id })
  // 0行なら取り直して、無ければ 404、始まっていれば 409
  if (deleted.length === 0) {
    await checkCancelable(db, member, id, now)
    throw new Error(`予約 ${id} を取り消せなかった`)
  }
}

async function checkCancelable(db: Db, member: Member, id: string, now: Date) {
  const current = await loadOwnReservation(db, member, id)
  if (reservationPhase(current.startsAt, current.endsAt, now) !== 'not_started') {
    fail(409, 'state_changed', CAR_MESSAGES.cancelStarted)
  }
}
