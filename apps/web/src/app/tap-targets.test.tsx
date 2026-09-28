import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { installFakeApi, meRoute, MOTHER } from '../../test/fakeApi'
import { fakeSupabase, testSession } from '../../test/fakeSupabase'
import { renderApp } from '../../test/render'

// 押せる部分は 44×44px 以上（COMMON-N-008）。jsdom は大きさを測れないので、Mantine の大きさの指定で確かめる
// （実際の大きさは T-24 でブラウザで測った。lg の高さは 50px）
const isLarge = (button: HTMLElement) =>
  expect(button.getAttribute('style') ?? '', button.textContent ?? '').toContain(
    '--button-height-lg',
  )

describe('押せる部分の大きさ（COMMON-N-008）', () => {
  it('ログイン画面のボタンは lg（高さ 50px）', async () => {
    renderApp('/login')
    isLarge(await screen.findByRole('button', { name: 'Google でログイン' }))
  })

  it('ホームと、ログアウトの確認のボタンは lg（高さ 50px）で、確認に小さな閉じるボタン（×）が無い', async () => {
    installFakeApi({ 'GET /me': meRoute(MOTHER) })
    fakeSupabase.setStoredSession(testSession())
    renderApp('/')

    const logout = await screen.findByRole('button', { name: 'ログアウト' })
    isLarge(logout)
    await userEvent.click(logout)
    const dialog = await screen.findByRole('dialog', { name: 'ログアウトしますか？' })
    const buttons = within(dialog).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['キャンセル', 'ログアウト'])
    buttons.forEach(isLarge)
  })
})
