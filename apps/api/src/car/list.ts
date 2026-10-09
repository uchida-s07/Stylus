import { CAR_MESSAGES, type Reservation, type ReservationDetail } from '@stylus/shared'
import { asc, eq, gt } from 'drizzle-orm'
import type { Db } from '../db/client'
import { carReservations, cars, members } from '../db/schema'
import type { Member } from '../env'
import { fail } from '../errors'

// 予約の行に、車の名前・「使わない」の印・予約した家族の表示名を結合する（画面で追加の問い合わせをしない）
export function selectReservationRows(db: Db) {
  return db
    .select({
      id: carReservations.id,
      carId: cars.id,
      carName: cars.name,
      carIsActive: cars.isActive,
      memberId: members.id,
      displayName: members.displayName,
      startsAt: carReservations.startsAt,
      endsAt: carReservations.endsAt,
      destination: carReservations.destination,
      memo: carReservations.memo,
      version: carReservations.version,
    })
    .from(carReservations)
    .innerJoin(cars, eq(carReservations.carId, cars.id))
    .innerJoin(members, eq(carReservations.memberId, members.id))
}

type ReservationRow = Awaited<ReturnType<typeof selectReservationRows>>[number]

export function toReservation(row: ReservationRow): Reservation {
  return {
    id: row.id,
    car: { id: row.carId, name: row.carName, isActive: row.carIsActive },
    member: { id: row.memberId, displayName: row.displayName },
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    destination: row.destination,
    version: row.version,
  }
}

export function toReservationDetail(row: ReservationRow, memberId: string): ReservationDetail {
  return { ...toReservation(row), memo: row.memo, isMine: row.memberId === memberId }
}

// これからの予約（使用中を含む。CAR-F-005）：終了が今より後を、開始の早い順（同じなら車の名前の順）
export async function listUpcoming(db: Db, now: Date): Promise<Reservation[]> {
  const rows = await selectReservationRows(db)
    .where(gt(carReservations.endsAt, now))
    .orderBy(asc(carReservations.startsAt), asc(cars.name), asc(carReservations.id))
  return rows.map(toReservation)
}

// 予約の中身（メモを含む。CAR-F-005〜008）。家族の誰でも見られる。無ければ 404
export async function loadReservationDetail(
  db: Db,
  member: Member,
  id: string,
): Promise<ReservationDetail> {
  const [row] = await selectReservationRows(db).where(eq(carReservations.id, id))
  if (!row) fail(404, 'not_found', CAR_MESSAGES.reservationNotFound)
  return toReservationDetail(row, member.id)
}
