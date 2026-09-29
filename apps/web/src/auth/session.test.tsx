import { cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi, meRoute, MOTHER } from '../../test/fakeApi'
import { fakeSupabase, testSession } from '../../test/fakeSupabase'
import { renderApp } from '../../test/render'

const HOUR = 60 * 60
const DAY = 24 * HOUR
const nowSeconds = () => Math.floor(Date.now() / 1000)
const loginScreen = () => screen.findByRole('main', { name: 'ログイン' })
const homeScreen = () => screen.findByRole('main', { name: 'ホーム' })
const bearers = (requests: Request[]) =>
  requests
    .filter((r) => new URL(r.url).pathname === '/me')
    .map((r) => r.headers.get('Authorization'))

// 最後に開いたときに保存したセッション（アクセストークンの期限は保存から1時間）
const savedDaysAgo = (days: number) => testSession({ expires_at: nowSeconds() - days * DAY + HOUR })

describe('ログインしたまま使い続けられる（AUTH-F-003）', () => {
  let requests: Request[]
  beforeEach(() => {
    requests = installFakeApi({ 'GET /me': meRoute(MOTHER) }).requests
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('[AUTH-F-003/AC-1] 最後に開いてから7日たち、アクセストークンの期限が切れていても、開くとログイン画面を経ずにホームが出る', async () => {
    fakeSupabase.setStoredSession(savedDaysAgo(7))
    const { visited } = renderApp('/')

    expect(await homeScreen()).toBeInTheDocument()
    expect(await screen.findByText('母')).toBeInTheDocument()
    expect(visited).not.toContain('/login')
    // 期限切れのトークンでは送らず、更新したトークンで送る
    expect(bearers(requests)).toEqual(['Bearer refreshed-access-token-1'])
  })

  it('[AUTH-F-003/AC-2] 端末に残っているログイン状態が無効になっていると、開くとログイン画面が出る', async () => {
    fakeSupabase.setStoredSession(savedDaysAgo(7))
    fakeSupabase.server.invalidateLogins()
    const { router } = renderApp('/')

    expect(await loginScreen()).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.queryByRole('main', { name: 'ホーム' })).not.toBeInTheDocument()
    expect(fakeSupabase.storedSession()).toBeNull()
  })

  it('[AUTH-F-003/AC-4] 開いたままアクセストークンの期限（1時間）を過ぎても、ホームを再読み込みすると再ログインなしで表示名が出る', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    fakeSupabase.setStoredSession(testSession())
    renderApp('/')
    expect(await screen.findByText('母')).toBeInTheDocument()

    // 1時間と少し、開いたまま置いておく
    vi.setSystemTime(Date.now() + HOUR * 1000 + 60 * 1000)
    // 再読み込み（ページを読み込み直す）
    cleanup()
    const { visited } = renderApp('/')

    expect(await screen.findByText('母')).toBeInTheDocument()
    expect(visited).not.toContain('/login')
    expect(bearers(requests)).toEqual([
      'Bearer test-access-token',
      'Bearer refreshed-access-token-1',
    ])
  })

  it('[AUTH-F-003/AC-5] 期限切れで通信できなかったあと、通信が戻ってから開き直すと、ログイン画面を経ずにホームが出る', async () => {
    fakeSupabase.setStoredSession(savedDaysAgo(1))
    fakeSupabase.server.setOffline(true)
    renderApp('/')
    // 通信できないときの表示は AUTH-F-003/AC-3（T-18）。ここではログイン状態が残ることだけを見る
    await waitFor(() => expect(screen.queryByLabelText('読み込み中')).not.toBeInTheDocument())
    expect(fakeSupabase.storedSession()).not.toBeNull()

    // 通信が戻り、アプリを開き直す
    fakeSupabase.server.setOffline(false)
    cleanup()
    const { visited } = renderApp('/')

    expect(await homeScreen()).toBeInTheDocument()
    expect(await screen.findByText('母')).toBeInTheDocument()
    expect(visited).not.toContain('/login')
  })

  // AC ではない確認（design.md「API が 401 を返したとき」）
  it('端末では期限内に見えるトークンを API が拒んでも（署名鍵の入れ替え）、更新して送り直し、ホームに表示名が出る', async () => {
    fakeSupabase.setStoredSession(testSession())
    fakeSupabase.server.rotateSigningKey()
    const { visited } = renderApp('/')

    expect(await screen.findByText('母')).toBeInTheDocument()
    expect(visited).not.toContain('/login')
    expect(bearers(requests)).toEqual([
      'Bearer test-access-token',
      'Bearer refreshed-access-token-1',
    ])
  })
})
