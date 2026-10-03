import { describe, expect, it, vi } from 'vitest'
import { installFakeApi, json, meRoute, MOTHER, TEST_API_URL } from '../../test/fakeApi'
import { fakeSupabase, testSession } from '../../test/fakeSupabase'
import { authorizedFetch, NetworkError } from './client'

const ME_URL = `${TEST_API_URL}/me`
const unauthenticated = () =>
  json({ error: { code: 'unauthenticated', message: 'unauthenticated' } }, 401)
const authorizations = (requests: Request[]) => requests.map((r) => r.headers.get('Authorization'))

// API への送り方。401 を受けたときの分かれ道（design.md「API が 401 を返したとき」）
describe('authorizedFetch', () => {
  it('アクセストークンを Authorization: Bearer で付けて送る', async () => {
    fakeSupabase.setStoredSession(testSession())
    const { requests } = installFakeApi({ 'GET /me': meRoute(MOTHER) })

    const res = await authorizedFetch(ME_URL)

    expect(res.status).toBe(200)
    expect(authorizations(requests)).toEqual(['Bearer test-access-token'])
    expect(fakeSupabase.auth.refreshSession).not.toHaveBeenCalled()
  })

  it('401 を受けたら、セッションを1回だけ更新して新しいトークンで送り直す', async () => {
    fakeSupabase.setStoredSession(testSession())
    fakeSupabase.server.rotateSigningKey()
    const { requests } = installFakeApi({ 'GET /me': meRoute(MOTHER) })

    const res = await authorizedFetch(ME_URL)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(MOTHER)
    expect(authorizations(requests)).toEqual([
      'Bearer test-access-token',
      'Bearer refreshed-access-token-1',
    ])
  })

  it('送り直しても 401 なら、それ以上は送らずに 401 を返す（ログイン状態は残す）', async () => {
    fakeSupabase.setStoredSession(testSession())
    const { requests } = installFakeApi({ 'GET /me': unauthenticated })

    const res = await authorizedFetch(ME_URL)

    expect(res.status).toBe(401)
    expect(requests).toHaveLength(2)
    expect(fakeSupabase.auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(fakeSupabase.storedSession()).not.toBeNull()
  })

  it('ログイン状態が無効で更新できなければ、この端末のセッションを消す（ログイン画面へ）', async () => {
    fakeSupabase.setStoredSession(testSession())
    fakeSupabase.server.rotateSigningKey()
    fakeSupabase.server.invalidateLogins()
    const { requests } = installFakeApi({ 'GET /me': meRoute(MOTHER) })

    const res = await authorizedFetch(ME_URL)

    expect(res.status).toBe(401)
    expect(requests).toHaveLength(1)
    // 端末ではトークンが期限内に見えるため、supabase-js は自分では消さない
    expect(fakeSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(fakeSupabase.storedSession()).toBeNull()
  })

  it('通信できずに更新できなければ、NetworkError にしてログイン状態は残す', async () => {
    fakeSupabase.setStoredSession(testSession())
    fakeSupabase.server.rotateSigningKey()
    fakeSupabase.server.setOffline(true)
    const { requests } = installFakeApi({ 'GET /me': meRoute(MOTHER) })

    await expect(authorizedFetch(ME_URL)).rejects.toBeInstanceOf(NetworkError)
    expect(requests).toHaveLength(1)
    expect(fakeSupabase.auth.signOut).not.toHaveBeenCalled()
    expect(fakeSupabase.storedSession()).not.toBeNull()
  })

  it('期限切れのトークンを通信できずに更新できなければ、トークン無しでは送らずに NetworkError にする', async () => {
    fakeSupabase.setStoredSession(testSession({ expires_at: Math.floor(Date.now() / 1000) - 60 }))
    fakeSupabase.server.setOffline(true)
    const { requests } = installFakeApi({ 'GET /me': meRoute(MOTHER) })

    await expect(authorizedFetch(ME_URL)).rejects.toBeInstanceOf(NetworkError)
    expect(requests).toHaveLength(0)
    expect(fakeSupabase.storedSession()).not.toBeNull()
  })

  it('API へ届かなければ、NetworkError にしてログイン状態は残す', async () => {
    fakeSupabase.setStoredSession(testSession())
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    await expect(authorizedFetch(ME_URL)).rejects.toBeInstanceOf(NetworkError)
    expect(fakeSupabase.storedSession()).not.toBeNull()
  })
})
