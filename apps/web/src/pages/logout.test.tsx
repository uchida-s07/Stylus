import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi, meRoute, MOTHER } from '../../test/fakeApi'
import { fakeSupabase, testSession } from '../../test/fakeSupabase'
import { renderApp } from '../../test/render'

const HOUR = 60 * 60

// ホームで「ログアウト」を押し、確認で choice を選ぶ
async function logout(choice: 'ログアウト' | 'キャンセル') {
  await userEvent.click(await screen.findByRole('button', { name: 'ログアウト' }))
  const dialog = await screen.findByRole('dialog', { name: 'ログアウトしますか？' })
  await userEvent.click(within(dialog).getByRole('button', { name: choice }))
}

async function expectLoginScreenAndNoSession(router: {
  state: { location: { pathname: string } }
}) {
  expect(await screen.findByRole('main', { name: 'ログイン' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
  expect(fakeSupabase.storedSession()).toBeNull()
}

describe('ログアウト（AUTH-F-004）', () => {
  beforeEach(() => {
    installFakeApi({ 'GET /me': meRoute(MOTHER) })
    fakeSupabase.setStoredSession(testSession())
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('[AUTH-F-004/AC-1] 「ログアウト」を押して確認で「ログアウト」を選ぶと、ログイン画面が出て、端末に保存されたログイン状態が消えている', async () => {
    const { router } = renderApp('/')
    await screen.findByText('母')

    await logout('ログアウト')

    await expectLoginScreenAndNoSession(router)
  })

  it('[AUTH-F-004/AC-2] 「ログアウト」を押して確認で「キャンセル」を選ぶと、ホームのままで、ログイン状態も残っている', async () => {
    const { router } = renderApp('/')
    await screen.findByText('母')

    await logout('キャンセル')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('main', { name: 'ホーム' })).toBeInTheDocument()
    expect(screen.getByText('母')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(fakeSupabase.storedSession()).not.toBeNull()
    expect(fakeSupabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('[AUTH-F-004/AC-3] 通信できないときに確認で「ログアウト」を選んでも、ログイン画面が出て、端末に保存されたログイン状態が消えている', async () => {
    const { router } = renderApp('/')
    await screen.findByText('母')

    fakeSupabase.server.setOffline(true)
    await logout('ログアウト')

    await expectLoginScreenAndNoSession(router)
  })

  it('[AUTH-F-004/AC-3] 開いたままアクセストークンの期限が切れ、通信できないときに確認で「ログアウト」を選んでも（supabase-js はセッションを消さずにエラーを返す）、ログイン画面が出て、端末に保存されたログイン状態が消えている', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { router } = renderApp('/')
    await screen.findByText('母')

    vi.setSystemTime(Date.now() + 2 * HOUR * 1000)
    fakeSupabase.server.setOffline(true)
    await logout('ログアウト')

    await expectLoginScreenAndNoSession(router)
  })

  it('[AUTH-F-004/AC-4] 端末 A と端末 B でログイン済みのとき、端末 A でログアウトしても、端末 B のログイン状態は取り消されない', async () => {
    // 端末 B のログイン（サーバーが発行済み）
    const deviceB = testSession({
      access_token: 'device-b-access',
      refresh_token: 'device-b-refresh',
    })
    fakeSupabase.server.register(deviceB)
    // この端末（端末 A）
    const { router } = renderApp('/')
    await screen.findByText('母')

    await logout('ログアウト')

    await expectLoginScreenAndNoSession(router)
    expect(fakeSupabase.server.hasLogin('device-b-refresh')).toBe(true)
    // この端末のログイン状態はサーバーでも取り消している
    expect(fakeSupabase.server.hasLogin('test-refresh-token')).toBe(false)
    // ほかの端末のログイン状態を取り消す要求を送らない
    for (const [options] of fakeSupabase.auth.signOut.mock.calls) {
      expect(options).toEqual({ scope: 'local' })
    }
  })
})
