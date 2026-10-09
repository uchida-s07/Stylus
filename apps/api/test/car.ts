import { apiErrorSchema } from '@stylus/shared'
import { eq } from 'drizzle-orm'
import { expect } from 'vitest'
import type { AppConfig } from '../src/app'
import { carReservations, cars } from '../src/db/schema'
import { createTestApp } from './app'
import { authHeader, seedFamily, type FamilyKey } from './family'

// 日本時間の日時を UTC の Date にする（例：jst('2026-10-10 09:00')）
export function jst(dateTime: string): Date {
  return new Date(`${dateTime.replace(' ', 'T')}:00+09:00`)
}

// 予約の API に送る日時（ISO 8601）
export function jstIso(dateTime: string): string {
  return jst(dateTime).toISOString()
}

// AC の Given に時刻が無いときの「今」（tasks.md D-3）：日本時間 2026-10-07 20:00
export const DEFAULT_NOW = '2026-10-07 20:00'

// 車の API のテストの土台：PGlite・本物のミドルウェア・家族4人・最初の車「BMW」
// 「今」は setNow で変えられる（要求を送る時点の今）
export async function createCarTestApp(overrides: Partial<AppConfig> = {}) {
  let now = jst(DEFAULT_NOW)
  const t = await createTestApp({ now: () => now, ...overrides })
  const family = await seedFamily(t.db)

  function setNow(dateTime: string) {
    now = jst(dateTime)
  }

  // その家族として API を呼ぶ
  async function call(who: FamilyKey, method: string, path: string, body?: unknown) {
    const headers: Record<string, string> = await authHeader(who)
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    return t.app.request(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  // 車を DB に直接入れる
  async function insertCar(name: string, isActive = true) {
    const [row] = await t.db.insert(cars).values({ name, isActive }).returning()
    return row!
  }

  // 車を DB から直接消す（ほかの家族が削除した、を用意する）
  async function deleteCar(id: string) {
    await t.db.delete(cars).where(eq(cars.id, id))
  }

  async function carId(name: string) {
    const [row] = await t.db.select().from(cars).where(eq(cars.name, name))
    if (!row) throw new Error(`車 ${name} が無い`)
    return row.id
  }

  // 予約を DB に直接入れる（終わった予約など、API では作れない状態を用意する）
  // 日時は日本時間の「YYYY-MM-DD HH:MM」
  async function insertReservation(
    values: {
      car: string
      who: FamilyKey
      from: string
      to: string
    } & Partial<Pick<typeof carReservations.$inferInsert, 'destination' | 'memo' | 'version'>>,
  ) {
    const { car, who, from, to, ...rest } = values
    const [row] = await t.db
      .insert(carReservations)
      .values({
        carId: await carId(car),
        memberId: family[who].id,
        startsAt: jst(from),
        endsAt: jst(to),
        requestId: crypto.randomUUID(),
        ...rest,
      })
      .returning()
    return row!
  }

  // 予約を DB から直接消す（取り消した、を用意する）
  async function deleteReservation(id: string) {
    await t.db.delete(carReservations).where(eq(carReservations.id, id))
  }

  async function reservationRows() {
    return t.db.select().from(carReservations)
  }

  async function findReservation(id: string) {
    const [row] = await t.db.select().from(carReservations).where(eq(carReservations.id, id))
    return row
  }

  return {
    ...t,
    family,
    setNow,
    call,
    insertCar,
    deleteCar,
    carId,
    insertReservation,
    deleteReservation,
    reservationRows,
    findReservation,
  }
}

export type CarTestApp = Awaited<ReturnType<typeof createCarTestApp>>

// エラーの応答を確かめ、本文の error を返す
export async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status)
  const body = apiErrorSchema.parse(await res.json())
  expect(body.error.code).toBe(code)
  return body.error
}
