import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from '../../test/db'

describe('Data API から読み書きできない（COMMON-N-003）', () => {
  let testDb: TestDb

  beforeEach(async () => {
    testDb = await createTestDb()
  })

  afterEach(async () => {
    await testDb.close()
  })

  it('[COMMON-N-003/AC-1] public スキーマのすべてのテーブルで RLS が有効で、ポリシーは1つも無い', async () => {
    const tables = await testDb.client.query<{ name: string; rls: boolean }>(
      `select c.relname as name, c.relrowsecurity as rls
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
        order by c.relname`,
    )
    // 調べる対象が空で素通りしないように、既知のテーブルが入っていることも確かめる
    expect(tables.rows.map((t) => t.name)).toContain('members')
    expect(tables.rows.filter((t) => !t.rls).map((t) => t.name)).toEqual([])

    const policies = await testDb.client.query(
      `select tablename, policyname from pg_policies where schemaname = 'public'`,
    )
    expect(policies.rows).toEqual([])
  })
})
