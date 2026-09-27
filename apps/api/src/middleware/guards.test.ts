import { apiErrorSchema } from '@stylus/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp } from '../../test/app'
import { signTestToken } from '../../test/jwt'
import { members } from '../db/schema'
import { requireAdmin, requireAttribute } from './guards'

// 家族（Auth の利用者 ID）
const FATHER = '1a2b3c4d-0000-4000-8000-000000000001'
const MOTHER = '1a2b3c4d-0000-4000-8000-000000000002'
const SEIGO = '1a2b3c4d-0000-4000-8000-000000000003'
const BROTHER = '1a2b3c4d-0000-4000-8000-000000000004'

describe('ロール・立場の判定（COMMON-N-002）', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  // 判定を付けたルートは、テストの中だけで本番と同じ組み立てのアプリに足す
  let app: Awaited<ReturnType<typeof createTestApp>>['app']

  beforeEach(async () => {
    t = await createTestApp()
    await t.db.insert(members).values([
      { authUserId: FATHER, email: 'father@example.com', displayName: '父', isParent: true },
      {
        authUserId: MOTHER,
        email: 'yuriko@example.com',
        displayName: '母',
        isParent: true,
        isCook: true,
      },
      { authUserId: SEIGO, email: 'seigo@example.com', displayName: 'せいご', isAdmin: true },
      { authUserId: BROTHER, email: 'brother@example.com', displayName: '息子' },
    ])
    app = t.app
    app.get('/cook-only', requireAttribute('cook'), (c) => c.json({ ok: true }))
    app.get('/parent-only', requireAttribute('parent'), (c) => c.json({ ok: true }))
    app.get('/admin-only', requireAdmin(), (c) => c.json({ ok: true }))
  })

  afterEach(async () => {
    await t.close()
  })

  async function call(path: string, authUserId: string) {
    const token = await signTestToken({ sub: authUserId })
    return app.request(path, { headers: { Authorization: `Bearer ${token}` } })
  }

  async function expectForbidden(res: Response) {
    expect(res.status).toBe(403)
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('forbidden')
  }

  it('[COMMON-N-002/AC-1] 料理担当だけに許すルートを、料理担当ではない家族（息子）が呼ぶと 403', async () => {
    await expectForbidden(await call('/cook-only', BROTHER))
  })

  it('[COMMON-N-002/AC-2] 料理担当だけに許すルートを、料理担当の家族（母）が呼ぶと処理される', async () => {
    const res = await call('/cook-only', MOTHER)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('[COMMON-N-002/AC-3] 管理者だけに許すルートを、管理者ではない家族（母）が呼ぶと 403', async () => {
    await expectForbidden(await call('/admin-only', MOTHER))
  })

  it('[COMMON-N-002/AC-4] 管理者だけに許すルートを、管理者（せいご）が呼ぶと処理される', async () => {
    const res = await call('/admin-only', SEIGO)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  // AC ではない確認：立場「親」
  it.each([
    ['父', 200, FATHER],
    ['母', 200, MOTHER],
    ['せいご', 403, SEIGO],
    ['息子', 403, BROTHER],
  ])('親だけに許すルートを %s が呼ぶと %i', async (_name, status, authUserId) => {
    expect((await call('/parent-only', authUserId)).status).toBe(status)
  })
})

describe('本番のアプリ', () => {
  it('判定確認用のルートを含まない', async () => {
    const t = await createTestApp()
    try {
      const paths = t.app.routes.map((r) => r.path)
      expect(paths).not.toContain('/cook-only')
      expect(paths).not.toContain('/parent-only')
      expect(paths).not.toContain('/admin-only')
      expect(paths).toContain('/me')
    } finally {
      await t.close()
    }
  })
})
