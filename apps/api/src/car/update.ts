import {
  CAR_MESSAGES,
  reservationPhase,
  type ReservationDetail,
  type ReservationEdit,
  type ReservationPhase,
} from '@stylus/shared'
import { and, eq, gt, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { carReservations } from '../db/schema'
import type { Member } from '../env'
import { fail, failInput } from '../errors'
import { PG, pgErrorCode } from '../validate'
import { failOverlap } from './conflict'
import { loadReservationDetail } from './list'

// 予約を直す（CAR-F-006。design.md「予約の状態と操作の可否」）
// 判定の順：形（ルートの jsonBody で 400）→ 予約があるか（404）→ 本人か（403）
// → 要求の形と今の状態が合うか（409 state_changed）→ 版と更新（ADR-0008 の条件付き更新1文）
export async function updateReservation(
  db: Db,
  member: Member,
  id: string,
  input: ReservationEdit,
  now: Date,
): Promise<ReservationDetail> {
  const current = await loadOwnReservation(db, member, id)
  checkPhase(input.kind, reservationPhase(current.startsAt, current.endsAt, now))
  // 使用中の予約の直し方：開始日時は送られないので、保存してある開始日時と比べる（tasks.md D-2）
  // 使用中の予約の開始日時は本人しか変えられず、使用中には変えられないので、読んだ値と比べて足りる
  if (input.kind === 'in_use' && input.endsAt.getTime() <= current.startsAt.getTime()) {
    failInput({ endsAt: CAR_MESSAGES.endNotAfterStart })
  }

  const changes =
    input.kind === 'not_started'
      ? {
          carId: input.carId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          destination: input.destination,
          memo: input.memo,
        }
      : // 使用中の予約は、車と開始日時を変えない。終了は今より前でもよい（早く返した時刻を残す）
        { endsAt: input.endsAt, destination: input.destination, memo: input.memo }
  try {
    // 状態の判定と更新の間に予約が始まる・終わる場合に備えて、時刻の条件も入れる（要求の形で選ぶ）
    // 同じ行の更新なので、排他制約は直す前の自分の予約とは比べない
    const updated = await db
      .update(carReservations)
      .set({ ...changes, version: sql`${carReservations.version} + 1`, updatedAt: now })
      .where(
        and(
          eq(carReservations.id, id),
          eq(carReservations.memberId, member.id),
          eq(carReservations.version, input.version),
          input.kind === 'not_started'
            ? gt(carReservations.startsAt, now)
            : gt(carReservations.endsAt, now),
        ),
      )
      .returning({ id: carReservations.id })
    if (updated.length === 0) await failNotUpdated(db, member, id, input.kind, now)
  } catch (error) {
    if (pgErrorCode(error) === PG.EXCLUSION_VIOLATION) {
      return failOverlap(db, {
        carId: input.kind === 'not_started' ? input.carId : current.carId,
        startsAt: input.kind === 'not_started' ? input.startsAt : current.startsAt,
        endsAt: input.endsAt,
        exceptId: id,
      })
    }
    throw error
  }
  return loadReservationDetail(db, member, id)
}

// 予約を読み、無ければ 404、本人でなければ 403（取り消しでも使う）
export async function loadOwnReservation(db: Db, member: Member, id: string) {
  const [row] = await db.select().from(carReservations).where(eq(carReservations.id, id))
  if (!row) fail(404, 'not_found', CAR_MESSAGES.reservationNotFound)
  if (row.memberId !== member.id) fail(403, 'forbidden', CAR_MESSAGES.forbidden)
  return row
}

// 要求の形（まだ始まっていない予約の直し方・使用中の予約の直し方）と今の状態が合わなければ 409
function checkPhase(kind: ReservationEdit['kind'], phase: ReservationPhase) {
  if (kind === phase) return
  if (phase === 'ended') fail(409, 'state_changed', CAR_MESSAGES.ended)
  if (phase === 'in_use') fail(409, 'state_changed', CAR_MESSAGES.started)
  // 使用中の予約の直し方が、まだ始まっていない予約に届いた（画面が見ていた状態と違う）
  fail(409, 'state_changed', CAR_MESSAGES.changed)
}

// 条件付き更新が0行だった：取り直して、無ければ 404、状態が変わっていれば・版だけ違えば 409
async function failNotUpdated(
  db: Db,
  member: Member,
  id: string,
  kind: ReservationEdit['kind'],
  now: Date,
): Promise<never> {
  const current = await loadOwnReservation(db, member, id)
  checkPhase(kind, reservationPhase(current.startsAt, current.endsAt, now))
  fail(409, 'state_changed', CAR_MESSAGES.changed)
}
