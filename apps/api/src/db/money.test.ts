import { asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from '../../test/db'
import { seedFamily, type Family } from '../../test/family'
import { billCategories, billEvents, bills, members, settlements } from './schema'

// Postgres のエラーコード（SQLSTATE）
const UNIQUE_VIOLATION = '23505'
const CHECK_VIOLATION = '23514'
// ON DELETE RESTRICT の違反
const RESTRICT_VIOLATION = '23001'

// お金の表の制約（design.md「データモデル」。AC ではない）
describe('お金の表の制約', () => {
  let testDb: TestDb
  let family: Family
  let categoryId: string

  beforeEach(async () => {
    testDb = await createTestDb()
    family = await seedFamily(testDb.db)
    const [category] = await testDb.db.select().from(billCategories).limit(1)
    categoryId = category!.id
  })

  afterEach(async () => {
    await testDb.close()
  })

  function bill(values: Partial<typeof bills.$inferInsert> = {}) {
    return {
      fromMemberId: family.seigo.id,
      toMemberId: family.mother.id,
      amount: 3000,
      categoryId,
      title: '歯医者',
      occurredOn: '2026-10-04',
      createdBy: family.seigo.id,
      requestId: crypto.randomUUID(),
      ...values,
    } satisfies typeof bills.$inferInsert
  }

  function insertBill(values: Partial<typeof bills.$inferInsert> = {}) {
    return testDb.db.insert(bills).values(bill(values)).returning()
  }

  async function expectRejected(query: Promise<unknown>, code: string) {
    const error = await query.then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(error, '拒否されなかった').toBeDefined()
    expect((error as { cause?: { code?: string } }).cause?.code).toBe(code)
  }

  it('最初のカテゴリーは 医療費・食費・交通費・日用品・その他 の順', async () => {
    const rows = await testDb.db
      .select({ name: billCategories.name })
      .from(billCategories)
      .orderBy(asc(billCategories.createdAt))
    expect(rows.map((r) => r.name)).toEqual(['医療費', '食費', '交通費', '日用品', 'その他'])
  })

  it('正しい請求は登録でき、請求中・版 1 になる。「家庭」（NULL）を片方に使える', async () => {
    const [row] = await insertBill()
    expect(row).toMatchObject({ status: 'requested', version: 1, settlementId: null })
    await insertBill({
      fromMemberId: null,
      toMemberId: family.kugo.id,
      createdBy: family.mother.id,
    })
    await insertBill({ toMemberId: null })
  })

  it('当事者が両方 NULL（家庭→家庭）・同じ家族の請求は拒否される', async () => {
    await expectRejected(insertBill({ fromMemberId: null, toMemberId: null }), CHECK_VIOLATION)
    await expectRejected(insertBill({ toMemberId: family.seigo.id }), CHECK_VIOLATION)
  })

  it.each([0, -100, 10_000_000])('金額 %d は拒否される', async (amount) => {
    await expectRejected(insertBill({ amount }), CHECK_VIOLATION)
  })

  it('金額 1 と 9,999,999 は登録できる', async () => {
    await insertBill({ amount: 1 })
    await insertBill({ amount: 9_999_999 })
  })

  it('件名・メモ：前後に空白がある・空・長すぎる値は拒否される（文字数はコードポイントで数える）', async () => {
    await expectRejected(insertBill({ title: '' }), CHECK_VIOLATION)
    await expectRejected(insertBill({ title: ' 歯医者' }), CHECK_VIOLATION)
    await expectRejected(insertBill({ title: '歯医者　' }), CHECK_VIOLATION)
    await expectRejected(insertBill({ title: 'あ'.repeat(51) }), CHECK_VIOLATION)
    await insertBill({ title: '😀'.repeat(50) })
    await expectRejected(insertBill({ memo: '' }), CHECK_VIOLATION)
    await expectRejected(insertBill({ memo: 'あ'.repeat(501) }), CHECK_VIOLATION)
    await insertBill({ memo: 'あ'.repeat(500) })
  })

  it('発生日は 2020-01-01 以降', async () => {
    await expectRejected(insertBill({ occurredOn: '2019-12-31' }), CHECK_VIOLATION)
    await insertBill({ occurredOn: '2020-01-01' })
  })

  it('同じ家族の同じ request_id は2件目が拒否される（別の家族なら同じ値でもよい）', async () => {
    const requestId = crypto.randomUUID()
    await insertBill({ requestId })
    await expectRejected(insertBill({ requestId }), UNIQUE_VIOLATION)
    await insertBill({
      requestId,
      fromMemberId: family.kugo.id,
      createdBy: family.kugo.id,
    })
  })

  it('請求に使われているカテゴリーは削除できない', async () => {
    await insertBill({ status: 'canceled' })
    await expectRejected(
      testDb.db.delete(billCategories).where(eq(billCategories.id, categoryId)),
      RESTRICT_VIOLATION,
    )
  })

  it('お金の記録がある家族の行は削除できない', async () => {
    await insertBill()
    await expectRejected(
      testDb.db.delete(members).where(eq(members.id, family.mother.id)),
      RESTRICT_VIOLATION,
    )
  })

  it('カテゴリー名：前後の空白・空・21文字は拒否され、同じ名前の2件目も拒否される', async () => {
    const add = (name: string) => testDb.db.insert(billCategories).values({ name })
    await expectRejected(add(''), CHECK_VIOLATION)
    await expectRejected(add('　学費'), CHECK_VIOLATION)
    await expectRejected(add('あ'.repeat(21)), CHECK_VIOLATION)
    await add('あ'.repeat(20))
    await expectRejected(add('医療費'), UNIQUE_VIOLATION)
  })

  it('経過：差し戻しには理由が要り、それ以外は理由を持たない。精算の経過には精算が要る', async () => {
    const [b] = await insertBill()
    const event = (values: Partial<typeof billEvents.$inferInsert>) =>
      testDb.db
        .insert(billEvents)
        .values({ billId: b!.id, kind: 'created', actorMemberId: family.seigo.id, ...values })
    await event({})
    await expectRejected(event({ kind: 'returned' }), CHECK_VIOLATION)
    await expectRejected(event({ kind: 'returned', reason: '　' }), CHECK_VIOLATION)
    await expectRejected(event({ kind: 'returned', reason: 'あ'.repeat(201) }), CHECK_VIOLATION)
    await event({ kind: 'returned', reason: '金額が違う' })
    await expectRejected(event({ kind: 'paid', reason: '金額が違う' }), CHECK_VIOLATION)
    await expectRejected(event({ kind: 'settled_paid' }), CHECK_VIOLATION)
  })

  it('精算：当事者・金額・状態と日時の組み合わせ', async () => {
    const settle = (values: Partial<typeof settlements.$inferInsert>) =>
      testDb.db.insert(settlements).values({
        payerMemberId: family.mother.id,
        receiverMemberId: family.seigo.id,
        amount: 2500,
        paidBy: family.mother.id,
        paidAt: new Date(),
        ...values,
      })
    await settle({})
    await settle({ amount: 0 })
    await expectRejected(settle({ amount: -1 }), CHECK_VIOLATION)
    await expectRejected(settle({ payerMemberId: null, receiverMemberId: null }), CHECK_VIOLATION)
    await expectRejected(settle({ status: 'confirmed' }), CHECK_VIOLATION)
    await settle({ status: 'confirmed', confirmedBy: family.seigo.id, confirmedAt: new Date() })
  })

  it('請求中の請求は精算に入れられない', async () => {
    const [s] = await testDb.db
      .insert(settlements)
      .values({
        payerMemberId: family.mother.id,
        receiverMemberId: family.seigo.id,
        amount: 3000,
        paidBy: family.mother.id,
        paidAt: new Date(),
      })
      .returning()
    await expectRejected(insertBill({ settlementId: s!.id }), CHECK_VIOLATION)
    await insertBill({ settlementId: s!.id, status: 'paid' })
  })
})
