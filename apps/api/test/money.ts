import { eq } from 'drizzle-orm'
import { billCategories, bills } from '../src/db/schema'
import type { AppConfig } from '../src/app'
import { createTestApp } from './app'
import { authHeader, seedFamily, type FamilyKey } from './family'

// お金の API のテストの土台：PGlite・本物のミドルウェア・家族4人
export async function createMoneyTestApp(overrides: Partial<AppConfig> = {}) {
  const t = await createTestApp(overrides)
  const family = await seedFamily(t.db)

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

  async function categoryId(name: string) {
    const [row] = await t.db.select().from(billCategories).where(eq(billCategories.name, name))
    if (!row) throw new Error(`カテゴリー ${name} が無い`)
    return row.id
  }

  // 請求を DB に直接入れる（操作の API を通さずに状態を用意する）
  async function insertBill(values: Partial<typeof bills.$inferInsert> = {}) {
    const [row] = await t.db
      .insert(bills)
      .values({
        fromMemberId: family.seigo.id,
        toMemberId: family.mother.id,
        amount: 3000,
        categoryId: values.categoryId ?? (await categoryId('医療費')),
        title: '歯医者',
        occurredOn: '2026-10-04',
        // 「家庭」の請求は母が登録したことにする
        createdBy:
          values.fromMemberId === null
            ? family.mother.id
            : (values.fromMemberId ?? family.seigo.id),
        requestId: crypto.randomUUID(),
        ...values,
      })
      .returning()
    return row!
  }

  return { ...t, family, call, categoryId, insertBill }
}

export type MoneyTestApp = Awaited<ReturnType<typeof createMoneyTestApp>>
