import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { installFakeApi, json, meRoute, MOTHER, networkDown } from '../../test/fakeApi'
import { fakeSupabase, testSession } from '../../test/fakeSupabase'
import { renderApp } from '../../test/render'

const NETWORK = '通信できません。電波の良いところでもう一度開いてください。'
const LOAD_FAILED = 'うまく読み込めませんでした。時間をおいてもう一度開いてください。'
const UNREGISTERED = 'この Google アカウントは登録されていません。管理者に連絡してください。'

const HOUR = 60 * 60
const nowSeconds = () => Math.floor(Date.now() / 1000)
// 昨日開いたときに保存したセッション（アクセストークンは期限切れ）
const expiredSession = () => testSession({ expires_at: nowSeconds() - 24 * HOUR + HOUR })

const notAMember = () =>
  json({ error: { code: 'not_a_member', message: '家族として登録されていません' } }, 403)
const internalError = () => json({ error: { code: 'internal', message: 'internal error' } }, 500)

async function expectErrorScreenWith(message: string) {
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(screen.queryByRole('main', { name: 'ホーム' })).not.toBeInTheDocument()
  expect(screen.queryByRole('main', { name: 'ログイン' })).not.toBeInTheDocument()
}

describe('通信できない・読み込めない・登録から外されたとき（AUTH-F-003、APP-F-001）', () => {
  it('[AUTH-F-003/AC-3] アクセストークンの期限が切れていて通信できないと、開くと「通信できません。…」が出て、端末のログイン状態は残る', async () => {
    fakeSupabase.setStoredSession(expiredSession())
    fakeSupabase.server.setOffline(true)
    installFakeApi({ 'GET /me': networkDown })
    const { visited } = renderApp('/')

    await expectErrorScreenWith(NETWORK)
    expect(visited).not.toContain('/login')
    expect(fakeSupabase.storedSession()).not.toBeNull()
  })

  it('[AUTH-F-003/AC-6] 端末にログイン状態が残っているが家族の登録から外されていると、開くと未登録のメッセージが出る', async () => {
    fakeSupabase.setStoredSession(testSession())
    installFakeApi({ 'GET /me': notAMember })
    renderApp('/')

    expect(await screen.findByRole('alert')).toHaveTextContent(UNREGISTERED)
    expect(screen.getByRole('main', { name: 'ログイン' })).toBeInTheDocument()
    expect(fakeSupabase.storedSession()).toBeNull()
  })

  it('[AUTH-F-003/AC-7] ログイン済みで自分の情報を問い合わせる API が 500 を返すと、開くと「うまく読み込めませんでした。…」が出て、端末のログイン状態は残る', async () => {
    fakeSupabase.setStoredSession(testSession())
    installFakeApi({ 'GET /me': internalError })
    renderApp('/')

    await expectErrorScreenWith(LOAD_FAILED)
    expect(fakeSupabase.storedSession()).not.toBeNull()
    expect(fakeSupabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('[APP-F-001/AC-3] ログイン済みでアクセストークンは期限内、画面は読み込めたが通信できないと、開くと「通信できません。…」が出る', async () => {
    fakeSupabase.setStoredSession(testSession())
    fakeSupabase.server.setOffline(true)
    installFakeApi({ 'GET /me': networkDown })
    renderApp('/')

    await expectErrorScreenWith(NETWORK)
    expect(fakeSupabase.storedSession()).not.toBeNull()
  })

  // AC ではない確認（design.md「API が 401 を返したとき」の、送り直しても 401 の場合）
  it('401 を受けて更新して送り直しても 401 なら、「うまく読み込めませんでした。…」が出て、端末のログイン状態は残る', async () => {
    fakeSupabase.setStoredSession(testSession())
    installFakeApi({
      'GET /me': () => json({ error: { code: 'unauthenticated', message: 'x' } }, 401),
    })
    renderApp('/')

    await expectErrorScreenWith(LOAD_FAILED)
    expect(fakeSupabase.storedSession()).not.toBeNull()
  })

  // AC ではない確認（design.md「API が 401 を返したとき」の、更新が通信エラーの場合）
  it('401 を受けて更新しようとしたが通信できなければ、「通信できません。…」が出る', async () => {
    fakeSupabase.setStoredSession(testSession())
    fakeSupabase.server.rotateSigningKey()
    fakeSupabase.server.setOffline(true)
    installFakeApi({ 'GET /me': meRoute(MOTHER) })
    renderApp('/')

    await expectErrorScreenWith(NETWORK)
    expect(fakeSupabase.storedSession()).not.toBeNull()
  })

  // AC ではない確認（design.md「API が 401 を返したとき」の、ログイン状態が無効の場合）
  it('401 を受けて更新しようとしたがログイン状態が無効なら、ログイン画面が出る', async () => {
    fakeSupabase.setStoredSession(testSession())
    fakeSupabase.server.rotateSigningKey()
    fakeSupabase.server.invalidateLogins()
    installFakeApi({ 'GET /me': meRoute(MOTHER) })
    const { router } = renderApp('/')

    expect(await screen.findByRole('main', { name: 'ログイン' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(fakeSupabase.storedSession()).toBeNull()
  })
})
