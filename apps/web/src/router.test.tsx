import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeApi, json, MOTHER } from '../test/fakeApi'
import { fakeSupabase, testSession } from '../test/fakeSupabase'
import { renderApp } from '../test/render'

const loginScreen = () => screen.findByRole('main', { name: 'ログイン' })
const homeScreen = () => screen.findByRole('main', { name: 'ホーム' })

describe('ログイン状態による画面の振り分け（AUTH-F-002）', () => {
  beforeEach(() => {
    installFakeApi({ 'GET /me': () => json(MOTHER) })
  })

  it('[AUTH-F-002/AC-4] この端末でログインしていないとき、ホームの URL を直接開くとログイン画面が出る', async () => {
    const { router } = renderApp('/')

    expect(await loginScreen()).toBeInTheDocument()
    expect(screen.queryByRole('main', { name: 'ホーム' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('[AUTH-F-002/AC-5] この端末でログイン済みのとき、ログイン画面の URL を開くとホームが出る', async () => {
    fakeSupabase.setStoredSession(testSession())
    const { router } = renderApp('/login')

    expect(await homeScreen()).toBeInTheDocument()
    expect(screen.queryByRole('main', { name: 'ログイン' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  // AC ではない確認
  it('ログインしていなければ、ログイン画面の URL でログイン画面が出る', async () => {
    renderApp('/login')
    expect(await loginScreen()).toBeInTheDocument()
  })

  it('ログイン済みなら、ホームの URL でホームが出る', async () => {
    fakeSupabase.setStoredSession(testSession())
    renderApp('/')
    expect(await homeScreen()).toBeInTheDocument()
  })

  it('端末のセッションを読み終えるまでは、ログイン画面もホームも出さない', () => {
    fakeSupabase.setStoredSession(testSession())
    renderApp('/')
    // INITIAL_SESSION の通知の前（同じ処理の中）
    expect(screen.getByLabelText('読み込み中')).toBeInTheDocument()
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
  })
})
