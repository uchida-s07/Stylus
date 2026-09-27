import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { installFakeApi, json, MOTHER } from '../../test/fakeApi'
import { fakeSupabase } from '../../test/fakeSupabase'
import { renderApp } from '../../test/render'

describe('Google でログインする（AUTH-F-002）', () => {
  it('[AUTH-F-002/AC-1] 表示名「母」で登録済みの Google アカウントで「Google でログイン」からログインを終えると、ホームに「母」と表示される', async () => {
    const { requests } = installFakeApi({ 'GET /me': () => json(MOTHER) })

    // ログイン画面で「Google でログイン」を押すと、Google の画面へ向かう（戻り先は /auth/callback）
    renderApp('/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Google でログイン' }))
    expect(fakeSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })

    // Google の画面でアカウントを選んで戻ってくる（ページは読み込み直される）
    renderApp('/auth/callback?code=test-code')

    expect(await screen.findByText('母')).toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'ホーム' })).toBeInTheDocument()
    expect(fakeSupabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('test-code')
    // 表示名は API から取り、アクセストークンを Authorization: Bearer で送る
    const me = requests.find((r) => new URL(r.url).pathname === '/me')
    expect(me?.headers.get('Authorization')).toBe('Bearer test-access-token')
  })
})
