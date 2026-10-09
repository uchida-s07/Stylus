import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from '../../test/db'
import { seedFamily, type Family } from '../../test/family'
import { carReservations, cars, members } from './schema'

// Postgres のエラーコード（SQLSTATE）
const UNIQUE_VIOLATION = '23505'
const CHECK_VIOLATION = '23514'
const EXCLUSION_VIOLATION = '23P01'
const FOREIGN_KEY_VIOLATION = '23503'
// ON DELETE RESTRICT の違反
const RESTRICT_VIOLATION = '23001'

// 車の表の制約（design.md「データモデル」「重なりの防ぎ方」、V-1。AC ではない）
describe('車の表の制約', () => {
  let testDb: TestDb
  let family: Family
  let noahId: string

  beforeEach(async () => {
    testDb = await createTestDb()
    family = await seedFamily(testDb.db)
    const [noah] = await testDb.db.insert(cars).values({ name: 'ノア' }).returning()
    noahId = noah!.id
  })

  afterEach(async () => {
    await testDb.close()
  })

  function insertReservation(values: Partial<typeof carReservations.$inferInsert> = {}) {
    return testDb.db
      .insert(carReservations)
      .values({
        carId: noahId,
        memberId: family.kugo.id,
        startsAt: new Date('2026-10-10T00:00:00Z'),
        endsAt: new Date('2026-10-10T03:00:00Z'),
        requestId: crypto.randomUUID(),
        ...values,
      })
      .returning()
  }

  async function expectRejected(query: Promise<unknown>, code: string) {
    const error = await query.then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(error, '拒否されなかった').toBeDefined()
    expect((error as { cause?: { code?: string } }).cause?.code).toBe(code)
  }

  it('最初の車「BMW」が「使う」で1台ある', async () => {
    const rows = await testDb.db.select().from(cars).where(eq(cars.name, 'BMW'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.isActive).toBe(true)
  })

  it('正しい予約は登録でき、版 1 になる', async () => {
    const [row] = await insertReservation({ destination: '大学', memo: '帰りに給油する' })
    expect(row).toMatchObject({ version: 1, destination: '大学', memo: '帰りに給油する' })
  })

  it('同じ車で時間が重なる2行目は排他制約で拒否される', async () => {
    await insertReservation()
    await expectRejected(
      insertReservation({
        memberId: family.mother.id,
        startsAt: new Date('2026-10-10T01:00:00Z'),
        endsAt: new Date('2026-10-10T02:00:00Z'),
      }),
      EXCLUSION_VIOLATION,
    )
  })

  it('12:00 に終わる行と 12:00 に始まる行は重ならない（[開始, 終了)）', async () => {
    await insertReservation()
    await insertReservation({
      startsAt: new Date('2026-10-10T03:00:00Z'),
      endsAt: new Date('2026-10-10T06:00:00Z'),
    })
    await insertReservation({
      startsAt: new Date('2026-10-09T23:00:00Z'),
      endsAt: new Date('2026-10-10T00:00:00Z'),
    })
  })

  it('別の車なら同じ時間でも入る', async () => {
    const [fit] = await testDb.db.insert(cars).values({ name: 'フィット' }).returning()
    await insertReservation()
    await insertReservation({ carId: fit!.id })
  })

  it('秒・ミリ秒のある日時、終了が開始と同じか前の予約は拒否される', async () => {
    await expectRejected(
      insertReservation({ startsAt: new Date('2026-10-10T00:00:30Z') }),
      CHECK_VIOLATION,
    )
    await expectRejected(
      insertReservation({ endsAt: new Date('2026-10-10T03:00:00.001Z') }),
      CHECK_VIOLATION,
    )
    await expectRejected(
      insertReservation({ endsAt: new Date('2026-10-10T00:00:00Z') }),
      CHECK_VIOLATION,
    )
    await expectRejected(
      insertReservation({ endsAt: new Date('2026-10-09T23:00:00Z') }),
      CHECK_VIOLATION,
    )
  })

  it('行き先・メモ：前後に空白がある・空・長すぎる値は拒否される（NULL はよい）', async () => {
    await expectRejected(insertReservation({ destination: '' }), CHECK_VIOLATION)
    await expectRejected(insertReservation({ destination: '　大学' }), CHECK_VIOLATION)
    await expectRejected(insertReservation({ destination: 'あ'.repeat(51) }), CHECK_VIOLATION)
    await expectRejected(insertReservation({ memo: '' }), CHECK_VIOLATION)
    await expectRejected(insertReservation({ memo: 'あ'.repeat(501) }), CHECK_VIOLATION)
    await insertReservation({ destination: 'あ'.repeat(50), memo: 'あ'.repeat(500) })
  })

  it('同じ家族の同じ request_id は2件目が拒否される（別の家族なら同じ値でもよい）', async () => {
    const requestId = crypto.randomUUID()
    await insertReservation({ requestId })
    await expectRejected(
      insertReservation({
        requestId,
        startsAt: new Date('2026-10-11T00:00:00Z'),
        endsAt: new Date('2026-10-11T03:00:00Z'),
      }),
      UNIQUE_VIOLATION,
    )
    await insertReservation({
      requestId,
      memberId: family.mother.id,
      startsAt: new Date('2026-10-11T00:00:00Z'),
      endsAt: new Date('2026-10-11T03:00:00Z'),
    })
  })

  it('存在しない車の予約は外部キーで拒否される', async () => {
    await expectRejected(insertReservation({ carId: crypto.randomUUID() }), FOREIGN_KEY_VIOLATION)
  })

  it('車の名前：前後の空白・空・21文字は拒否され、同じ名前の2台目も拒否される', async () => {
    const add = (name: string, isActive = true) => testDb.db.insert(cars).values({ name, isActive })
    await expectRejected(add(''), CHECK_VIOLATION)
    await expectRejected(add('　フィット'), CHECK_VIOLATION)
    await expectRejected(add('あ'.repeat(21)), CHECK_VIOLATION)
    await add('あ'.repeat(20))
    await expectRejected(add('ノア', false), UNIQUE_VIOLATION)
  })

  it('予約のある車と家族の行は削除できない', async () => {
    await insertReservation()
    await expectRejected(testDb.db.delete(cars).where(eq(cars.id, noahId)), RESTRICT_VIOLATION)
    await expectRejected(
      testDb.db.delete(members).where(eq(members.id, family.kugo.id)),
      RESTRICT_VIOLATION,
    )
  })
})
