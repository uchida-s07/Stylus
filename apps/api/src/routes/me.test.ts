import { apiErrorSchema, meResponseSchema } from '@stylus/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp, testAppConfig } from '../../test/app'
import { signTestToken } from '../../test/jwt'
import { createApp } from '../app'
import { members } from '../db/schema'

const YURIKO_AUTH_ID = '6f1c2b1e-7d4a-4c1e-9a55-3f0a2d8b9c10'
const STRANGER_AUTH_ID = '0b7e4a52-93f1-4d6b-8c2e-5a1f9d3e7c64'

describe('GET /me', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>

  beforeEach(async () => {
    t = await createTestApp()
    // 母：立場「親」「料理担当」、ロールなし
    await t.db.insert(members).values({
      authUserId: YURIKO_AUTH_ID,
      email: 'yuriko@example.com',
      displayName: '母',
      isParent: true,
      isCook: true,
    })
  })

  afterEach(async () => {
    await t.close()
  })

  function getMe(token?: string, authorization = token && `Bearer ${token}`) {
    return t.app.request('/me', authorization ? { headers: { Authorization: authorization } } : {})
  }

  async function expectError(res: Response, status: number, code: string) {
    expect(res.status).toBe(status)
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe(code)
  }

  it('[COMMON-N-001/AC-1] Authorization ヘッダーが無いと 401', async () => {
    await expectError(await getMe(), 401, 'unauthenticated')
  })

  it('[COMMON-N-001/AC-2] 署名が正しくないトークンは 401', async () => {
    const token = await signTestToken({ sub: YURIKO_AUTH_ID, forged: true })
    await expectError(await getMe(token), 401, 'unauthenticated')
  })

  it('[COMMON-N-001/AC-3] 期限切れのトークンは 401', async () => {
    const token = await signTestToken({ sub: YURIKO_AUTH_ID, expiresInSec: -60 })
    await expectError(await getMe(token), 401, 'unauthenticated')
  })

  it('[COMMON-N-001/AC-4] 有効なトークンでも家族として登録されていなければ 403', async () => {
    const token = await signTestToken({ sub: STRANGER_AUTH_ID })
    await expectError(await getMe(token), 403, 'not_a_member')
  })

  it('[COMMON-N-001/AC-5] 登録された家族の有効なトークンなら 200 と本人の情報', async () => {
    const token = await signTestToken({ sub: YURIKO_AUTH_ID, email: 'yuriko@example.com' })
    const res = await getMe(token)

    expect(res.status).toBe(200)
    const me = meResponseSchema.parse(await res.json())
    const [yuriko] = await t.db.select().from(members)
    expect(me.id).toBe(yuriko?.id)
    expect(me.displayName).toBe('母')
  })

  it('[AUTH-F-001/AC-1] 母として登録した人が自分の情報を問い合わせると、表示名「母」・立場「親」「料理担当」・ロールなしが返る', async () => {
    const token = await signTestToken({ sub: YURIKO_AUTH_ID, email: 'yuriko@example.com' })
    const res = await getMe(token)

    expect(res.status).toBe(200)
    const me = meResponseSchema.parse(await res.json())
    expect(me).toMatchObject({ displayName: '母', isParent: true, isCook: true, isAdmin: false })
  })

  // AC ではない確認：トークンの検証の細部
  it.each([
    ['発行元が違う', { issuer: 'https://other-project.supabase.co/auth/v1' }],
    ['宛先が authenticated でない', { audience: 'anon' }],
    ['sub が利用者 ID の形でない', { sub: 'not-a-uuid' }],
  ])('%s トークンは 401', async (_label, options) => {
    const token = await signTestToken({ sub: YURIKO_AUTH_ID, ...options })
    await expectError(await getMe(token), 401, 'unauthenticated')
  })

  it.each([
    ['Bearer が無い', (token: string) => token],
    ['Basic', (token: string) => `Basic ${token}`],
    ['トークンが空', () => 'Bearer '],
    ['JWT の形でない', () => 'Bearer abc.def'],
  ])('Authorization の形が違う（%s）と 401', async (_label, header) => {
    const token = await signTestToken({ sub: YURIKO_AUTH_ID })
    await expectError(await getMe(undefined, header(token)), 401, 'unauthenticated')
  })
})

describe('トークンの検証と DB', () => {
  it('トークンが無効なら DB を開かない', async () => {
    // testAppConfig は DB を開こうとすると例外を投げる
    const app = createApp(testAppConfig())
    const res = await app.request('/me')
    expect(res.status).toBe(401)
  })
})
