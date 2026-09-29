import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { installFakeApi, json, MOTHER } from '../../test/fakeApi'
import { fakeSupabase } from '../../test/fakeSupabase'
import { renderApp } from '../../test/render'

const UNREGISTERED = 'この Google アカウントは登録されていません。管理者に連絡してください。'
const FAILED = 'ログインできませんでした。時間をおいてもう一度お試しください。'

const notAMember = () =>
  json({ error: { code: 'not_a_member', message: '家族として登録されていません' } }, 403)

// Google（Supabase）から戻ってきたときのエラーの付き方
const SIGNUP_DISABLED =
  '/auth/callback?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance'
const CANCELLED = '/auth/callback?error=access_denied&error_description=The+user+denied+access'
const SERVER_ERROR =
  '/auth/callback?error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code'

async function expectLoginScreenWith(message: string) {
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(screen.getByRole('main', { name: 'ログイン' })).toBeInTheDocument()
  expect(screen.queryByRole('main', { name: 'ホーム' })).not.toBeInTheDocument()
}

describe('ログインの失敗・未登録・キャンセル（AUTH-F-002）', () => {
  it('[AUTH-F-002/AC-2] 登録されていない Google アカウントで戻ると（サインアップ無効で弾かれる）、ホームは出ず未登録のメッセージが出る', async () => {
    const { router } = renderApp(SIGNUP_DISABLED)

    await expectLoginScreenWith(UNREGISTERED)
    expect(router.state.location.pathname).toBe('/login')
  })

  it('[AUTH-F-002/AC-2] ログインはできたが家族として登録されていないとき（API が 403）、ホームは出ず未登録のメッセージが出る', async () => {
    installFakeApi({ 'GET /me': notAMember })
    const { router } = renderApp('/auth/callback?code=test-code')

    await expectLoginScreenWith(UNREGISTERED)
    expect(router.state.location.pathname).toBe('/login')
    // ログインしていない状態に戻す（この端末のセッションだけを消す）
    expect(fakeSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(fakeSupabase.storedSession()).toBeNull()
  })

  it.each([
    ['Supabase がエラーを付けて戻す', SERVER_ERROR],
    ['戻り先にコードもエラーも無い', '/auth/callback'],
  ])(
    '[AUTH-F-002/AC-3] ログインの途中で認証に失敗すると（%s）、失敗のメッセージが出てログイン画面のまま',
    async (_label, path) => {
      const { router } = renderApp(path)

      await expectLoginScreenWith(FAILED)
      expect(router.state.location.pathname).toBe('/login')
    },
  )

  it('[AUTH-F-002/AC-3] コードの引き換えに失敗すると、失敗のメッセージが出てログイン画面のまま', async () => {
    fakeSupabase.failExchange(new Error('invalid flow state'))
    renderApp('/auth/callback?code=test-code')

    await expectLoginScreenWith(FAILED)
    expect(fakeSupabase.storedSession()).toBeNull()
  })

  it('[AUTH-F-002/AC-3] 「Google でログイン」で Google の画面へ移れないと、失敗のメッセージが出てログイン画面のまま', async () => {
    fakeSupabase.auth.signInWithOAuth.mockResolvedValueOnce({
      data: { provider: 'google', url: null },
      error: new Error('Failed to fetch'),
    })
    renderApp('/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Google でログイン' }))

    await expectLoginScreenWith(FAILED)
  })

  it('[AUTH-F-002/AC-6] 登録されていない Google アカウントで弾かれた直後にアプリを開き直すと、ログイン画面が出る', async () => {
    installFakeApi({ 'GET /me': notAMember })
    renderApp('/auth/callback?code=test-code')
    await screen.findByRole('alert')

    // アプリを開き直す（端末に残ったセッションで判断される）
    cleanup()
    installFakeApi({ 'GET /me': () => json(MOTHER) })
    const { router } = renderApp('/')

    expect(await screen.findByRole('main', { name: 'ログイン' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    // 開き直した後はメッセージを出さない
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('[AUTH-F-002/AC-7] Google の画面でキャンセルして戻ると、ログイン画面のままでメッセージは出ない', async () => {
    const { router } = renderApp(CANCELLED)

    expect(await screen.findByRole('main', { name: 'ログイン' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(fakeSupabase.auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  // AC ではない確認：エラーが URL の # の後ろに付いて戻っても読み分ける
  it('エラーが # の後ろに付いていても未登録と読み分ける', async () => {
    renderApp(`/auth/callback#${SIGNUP_DISABLED.split('?')[1]}`)
    await expectLoginScreenWith(UNREGISTERED)
  })
})
