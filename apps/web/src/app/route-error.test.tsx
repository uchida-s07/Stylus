import { render, screen } from '@testing-library/react'
import { createMemoryRouter, type RouteObject } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { installFakeApi, meRoute, MOTHER } from '../../test/fakeApi'
import { fakeSupabase, testSession } from '../../test/fakeSupabase'
import { routes } from '../router'
import { reportError } from '../sentry'
import { AppRoot } from './AppRoot'

vi.mock('../sentry', () => ({ reportError: vi.fn() }))

const LOAD_FAILED = 'うまく読み込めませんでした。時間をおいてもう一度開いてください。'
const failure = new Error('描画中の予期しないエラー')

function Broken(): never {
  throw failure
}

// 本番の画面に、描画中に例外を投げる画面を1つ足して開く
function renderWithBrokenPage(path: string) {
  const [root] = routes as [RouteObject]
  const children = [...(root.children ?? []), { path: '/broken', element: <Broken /> }]
  const router = createMemoryRouter([{ errorElement: root.errorElement, children }], {
    initialEntries: [path],
  })
  render(<AppRoot router={router} />)
  return router
}

describe('画面の描画中の予期しないエラー（COMMON-N-011）', () => {
  it('「うまく読み込めませんでした。…」を出し、エラーを Sentry へ送る', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderWithBrokenPage('/broken')

    expect(await screen.findByRole('alert')).toHaveTextContent(LOAD_FAILED)
    expect(reportError).toHaveBeenCalledWith(failure)
  })

  it('無い URL を開くと、エラーにせずホームへ送る（Sentry へは送らない）', async () => {
    installFakeApi({ 'GET /me': meRoute(MOTHER) })
    fakeSupabase.setStoredSession(testSession())
    const router = renderWithBrokenPage('/no-such-page')

    expect(await screen.findByText('母')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(reportError).not.toHaveBeenCalled()
  })
})
