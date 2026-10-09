import type { createReservationInputSchema, Reservation } from '@stylus/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { Db } from '../db/client'
import { carReservations, cars } from '../db/schema'
import type { Member } from '../env'
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
  let inserted: { id: string } | undefined
  try {
    inserted = await insertIfCarActive(db, member, input)
  } catch (error) {
    // 同じ車で時間が重なる予約がある。同時に送られた2つは、後に保存しようとした方がここに来る
    if (pgErrorCode(error) === PG.EXCLUSION_VIOLATION) return failOverlap(db, input)
    throw error
  }
  if (!inserted) throw new Error('車が「使う」でない')
  return loadReservation(db, inserted.id)
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
