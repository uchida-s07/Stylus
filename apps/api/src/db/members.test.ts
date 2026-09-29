import { count, eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from '../../test/db'
import { members } from './schema'

// Postgres のエラーコード（SQLSTATE）
const NOT_NULL_VIOLATION = '23502'
const UNIQUE_VIOLATION = '23505'
const CHECK_VIOLATION = '23514'

describe('members の登録（AUTH-F-001）', () => {
  let testDb: TestDb

  beforeEach(async () => {
    testDb = await createTestDb()
  })

  afterEach(async () => {
    await testDb.close()
  })

  function register(values: typeof members.$inferInsert) {
    return testDb.db.insert(members).values(values)
  }

  // 列を欠いた登録（管理者が SQL を手で書く場合を想定。型では書けないので SQL で入れる）
  function registerWithNull(column: 'email' | 'display_name') {
    const email = column === 'email' ? null : 'yuriko@example.com'
    const displayName = column === 'display_name' ? null : '母'
    return testDb.db.execute(
      sql`insert into members (email, display_name) values (${email}, ${displayName})`,
    )
  }

  // 制約で拒否されたこと（ほかの理由の失敗と区別するため、SQLSTATE まで確かめる）
  async function expectRejected(insert: Promise<unknown>, code: string) {
    const error = await insert.then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(error, '登録が拒否されなかった').toBeDefined()
    expect((error as { cause?: { code?: string } }).cause?.code).toBe(code)
  }

  async function countMembers(email?: string) {
    const [row] = await testDb.db
      .select({ n: count() })
      .from(members)
      .where(email === undefined ? undefined : eq(members.email, email))
    return row?.n
  }

  it('[AUTH-F-001/AC-2] 同じメールアドレスの2件目は拒否され、その家族は1人のまま', async () => {
    await register({ email: 'yuriko@example.com', displayName: '母' })

    await expectRejected(
      register({ email: 'yuriko@example.com', displayName: '母（2件目）' }),
      UNIQUE_VIOLATION,
    )
    expect(await countMembers('yuriko@example.com')).toBe(1)
  })

  it('[AUTH-F-001/AC-3] 表示名が空（""）なら拒否され、家族は0人のまま', async () => {
    await expectRejected(
      register({ email: 'yuriko@example.com', displayName: '' }),
      CHECK_VIOLATION,
    )
    expect(await countMembers()).toBe(0)
  })

  it('[AUTH-F-001/AC-3] 表示名が空白だけ（"　"）なら拒否され、家族は0人のまま', async () => {
    await expectRejected(
      register({ email: 'yuriko@example.com', displayName: '　' }),
      CHECK_VIOLATION,
    )
    await expectRejected(
      register({ email: 'yuriko@example.com', displayName: ' \t　 ' }),
      CHECK_VIOLATION,
    )
    expect(await countMembers()).toBe(0)
  })

  it('[AUTH-F-001/AC-3] 表示名が無い（NULL）なら拒否され、家族は0人のまま', async () => {
    await expectRejected(registerWithNull('display_name'), NOT_NULL_VIOLATION)
    expect(await countMembers()).toBe(0)
  })

  it('[AUTH-F-001/AC-4] メールアドレスが空（""）なら拒否され、家族は0人のまま', async () => {
    await expectRejected(register({ email: '', displayName: '母' }), CHECK_VIOLATION)
    expect(await countMembers()).toBe(0)
  })

  it('[AUTH-F-001/AC-4] メールアドレスが無い（NULL）なら拒否され、家族は0人のまま', async () => {
    await expectRejected(registerWithNull('email'), NOT_NULL_VIOLATION)
    expect(await countMembers()).toBe(0)
  })

  it('[AUTH-F-001/AC-5] 大文字を含むメールアドレスは拒否され、家族は0人のまま', async () => {
    await expectRejected(
      register({ email: 'Yuriko@example.com', displayName: '母' }),
      CHECK_VIOLATION,
    )
    expect(await countMembers()).toBe(0)
  })

  // design.md「データモデル」の制約（AC ではない）
  it('同じ Auth の利用者 ID は2人に紐づけられない', async () => {
    const authUserId = '6f1c2b1e-7d4a-4c1e-9a55-3f0a2d8b9c10'
    await register({ email: 'yuriko@example.com', displayName: '母', authUserId })

    await expectRejected(
      register({ email: 'seigo@example.com', displayName: 'せいご', authUserId }),
      UNIQUE_VIOLATION,
    )
    expect(await countMembers()).toBe(1)
  })

  it('小文字のメールアドレスと表示名があれば登録できる', async () => {
    await register({ email: 'yuriko@example.com', displayName: '母' })
    expect(await countMembers()).toBe(1)
  })
})
