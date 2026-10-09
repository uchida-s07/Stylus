import { CAR_MESSAGES, type createReservationInputSchema, type Reservation } from '@stylus/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { Db } from '../db/client'
import { carReservations, cars } from '../db/schema'
import type { Member } from '../env'
import { fail, failInput } from '../errors'
import { PG, pgErrorCode } from '../validate'
import { failOverlap } from './conflict'
import { selectReservationRows, toReservation } from './list'

export type ReservationCreateInput = z.output<ReturnType<typeof createReservationInputSchema>>

// 予約を入れる（CAR-F-004。design.md「予約の登録」）
// 車が「使う」であることを挿入の文の条件に入れる（INSERT … SELECT … FROM cars WHERE id = ? AND is_active）
export async function createReservation(
  db: Db,
  member: Member,
  input: ReservationCreateInput,
): Promise<Reservation> {
  // 同じ request_id の予約がすでにある（送り直し）。同じ中身を送り直すと一意制約と排他制約（自分の予約と
  // 重なる）の両方に当たり、どちらの違反が返るかは決まらないので、挿入の前に引く
  const existing = await sameRequestReservation(db, member, input)
  if (existing) return existing

  let inserted: { id: string } | undefined
  try {
    inserted = await insertIfCarActive(db, member, input)
  } catch (error) {
    const code = pgErrorCode(error)
    // 続けて2回押したときのように、同時に挿入が走った：request_id で引き直す
    if (code === PG.UNIQUE_VIOLATION || code === PG.EXCLUSION_VIOLATION) {
      const again = await sameRequestReservation(db, member, input)
      if (again) return again
    }
    // 同じ車で時間が重なる予約がある。同時に送られた2つは、後に保存しようとした方がここに来る
    if (code === PG.EXCLUSION_VIOLATION) return failOverlap(db, input)
    // 車の条件の確認の後に、その車が削除された
    if (code === PG.FOREIGN_KEY_VIOLATION) failInput({ carId: CAR_MESSAGES.carNotFound })
    throw error
  }
  if (!inserted) return failCarNotReservable(db, input.carId)
  return loadReservation(db, inserted.id)
}

// 同じ request_id の予約があれば、中身が同じならその予約を返し（CAR-F-004/AC-16）、
// 違えば 409（AC-17。直した中身を黙って捨てない）。無ければ undefined
async function sameRequestReservation(
  db: Db,
  member: Member,
  input: ReservationCreateInput,
): Promise<Reservation | undefined> {
  const [row] = await db
    .select()
    .from(carReservations)
    .where(
      and(eq(carReservations.memberId, member.id), eq(carReservations.requestId, input.requestId)),
    )
  if (!row) return undefined
  const same =
    row.carId === input.carId &&
    row.startsAt.getTime() === input.startsAt.getTime() &&
    row.endsAt.getTime() === input.endsAt.getTime() &&
    row.destination === input.destination &&
    row.memo === input.memo
  if (!same) fail(409, 'already_registered', CAR_MESSAGES.alreadyRegistered)
  return loadReservation(db, row.id)
}

// 選んだ車（移す先の車）の条件に当たらなかった：車を取り直して、無ければ 400、「使わない」なら 409
export async function failCarNotReservable(db: Db, carId: string): Promise<never> {
  const [car] = await db.select({ isActive: cars.isActive }).from(cars).where(eq(cars.id, carId))
  if (!car) failInput({ carId: CAR_MESSAGES.carNotFound })
  if (!car.isActive) fail(409, 'car_unavailable', CAR_MESSAGES.carUnavailable)
  throw new Error(`車 ${carId} は「使う」なのに条件に当たらなかった`)
}

// insert … select は表の列をすべて定義の順に並べる（Drizzle の決まり）
function insertIfCarActive(db: Db, member: Member, input: ReservationCreateInput) {
  return db
    .insert(carReservations)
    .select(
      db
        .select({
          id: sql`gen_random_uuid()`.as('id'),
          carId: cars.id,
          memberId: sql`${member.id}::uuid`.as('member_id'),
          startsAt: sql`${input.startsAt.toISOString()}::timestamptz`.as('starts_at'),
          endsAt: sql`${input.endsAt.toISOString()}::timestamptz`.as('ends_at'),
          destination: sql`${input.destination}::text`.as('destination'),
          memo: sql`${input.memo}::text`.as('memo'),
          version: sql`1`.as('version'),
          requestId: sql`${input.requestId}::uuid`.as('request_id'),
          createdAt: sql`now()`.as('created_at'),
          updatedAt: sql`now()`.as('updated_at'),
        })
        .from(cars)
        .where(and(eq(cars.id, input.carId), eq(cars.isActive, true))),
    )
    .returning({ id: carReservations.id })
    .then((rows) => rows[0])
}

export async function loadReservation(db: Db, id: string): Promise<Reservation> {
  const [row] = await selectReservationRows(db).where(eq(carReservations.id, id))
  if (!row) throw new Error(`予約 ${id} が無い`)
  return toReservation(row)
}
