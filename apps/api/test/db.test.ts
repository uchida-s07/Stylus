import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { members } from '../src/db/schema'
import { createTestDb, type TestDb } from './db'

// テスト用 DB の仕組みそのものの確認（AC ではない）
describe('createTestDb', () => {
  let testDb: TestDb

  beforeEach(async () => {
    testDb = await createTestDb()
  })

  afterEach(async () => {
    await testDb.close()
  })

  it('マイグレーションが当たり、members に既定値つきで登録できる', async () => {
    const [row] = await testDb.db
      .insert(members)
      .values({ email: 'yuriko@example.com', displayName: '母' })
      .returning()

    expect(row).toMatchObject({
      email: 'yuriko@example.com',
      displayName: '母',
      authUserId: null,
      isAdmin: false,
      isParent: false,
      isCook: false,
    })
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(row?.createdAt).toBeInstanceOf(Date)
  })

  it('テストごとに空の DB から始まる', async () => {
    expect(await testDb.db.select().from(members)).toEqual([])
  })
})
