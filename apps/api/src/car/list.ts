import {
  addDays,
  CAR_MESSAGES,
  HISTORY_PAGE_SIZE,
  jstStartOfDay,
  toHistoryCursor,
  type Reservation,
  type ReservationDetail,
  type ReservationListResponse,
} from '@stylus/shared'
import { and, asc, desc, eq, gt, lt, lte, sql } from 'drizzle-orm'
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

// 期間で引く予約（車の画面のカレンダー。CAR-F-005、spec 004）：日本時間の from の 0:00 から to の翌日 0:00 までに
// 一部でもかかる予約を、終わった・使用中・まだ始まっていないを区別せずに、開始の早い順（同じなら車の名前の順）ですべて
// from・to は reservationListQuerySchema が実在する日付で 42 日までと確かめている
export async function listRange(db: Db, from: string, to: string): Promise<Reservation[]> {
  const start = jstStartOfDay(from)!
  const end = jstStartOfDay(addDays(to, 1))!
  const rows = await selectReservationRows(db)
    .where(and(lt(carReservations.startsAt, end), gt(carReservations.endsAt, start)))
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

// 終わった予約（履歴。CAR-F-008）：終了が今以前を、終了の遅い順に30件ずつ。カーソルは最後の行の (終了日時, ID)
export async function listPast(
  db: Db,
  now: Date,
  before: { endsAt: Date; id: string } | undefined,
): Promise<ReservationListResponse> {
  const rows = await selectReservationRows(db)
    .where(
      and(
        lte(carReservations.endsAt, now),
        before &&
          sql`(${carReservations.endsAt}, ${carReservations.id}) < (${before.endsAt.toISOString()}::timestamptz, ${before.id}::uuid)`,
      ),
    )
    .orderBy(desc(carReservations.endsAt), desc(carReservations.id))
    .limit(HISTORY_PAGE_SIZE + 1)
  const page = rows.slice(0, HISTORY_PAGE_SIZE).map(toReservation)
  const last = page.at(-1)
  return {
    reservations: page,
    nextCursor:
      rows.length > HISTORY_PAGE_SIZE && last ? toHistoryCursor(last.endsAt, last.id) : null,
  }
}
