import { CAR_MESSAGES, type ReservationDetail, type ReservationEdit } from '@stylus/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { carReservations } from '../db/schema'
import type { Member } from '../env'
import { fail } from '../errors'
import { PG, pgErrorCode } from '../validate'
import { failOverlap } from './conflict'
import { loadReservationDetail } from './list'

// 予約を直す（CAR-F-006。design.md「予約の状態と操作の可否」）
// 版つきの条件付き更新1文で行う（ADR-0008）
export async function updateReservation(
  db: Db,
  member: Member,
  id: string,
  input: ReservationEdit,
  now: Date,
): Promise<ReservationDetail> {
  if (input.kind !== 'not_started') throw new Error('使用中の予約の直し方はまだ無い')
  const { version } = input
  const changes = {
    carId: input.carId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    destination: input.destination,
    memo: input.memo,
  }
  try {
    // 同じ行の更新なので、排他制約は直す前の自分の予約とは比べない
    const updated = await db
      .update(carReservations)
      .set({ ...changes, version: sql`${carReservations.version} + 1`, updatedAt: now })
      .where(and(eq(carReservations.id, id), eq(carReservations.version, version)))
      .returning({ id: carReservations.id })
    if (updated.length === 0) fail(409, 'state_changed', CAR_MESSAGES.changed)
  } catch (error) {
    if (pgErrorCode(error) === PG.EXCLUSION_VIOLATION) {
      return failOverlap(db, { ...changes, exceptId: id })
    }
    throw error
  }
  return loadReservationDetail(db, member, id)
}
