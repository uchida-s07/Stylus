import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeApi, json, meRoute, MOTHER, networkDown } from '../../../test/fakeApi'
import { billSummary, errorResponse, listResponse, party, signIn } from '../../../test/money'
import { renderApp } from '../../../test/render'

describe('お金の画面（MONEY-F-004）', () => {
  beforeEach(() => {
    signIn()
  })

  it('[MONEY-F-004/AC-4] くうごが関係する請求が1件も無いと、「請求はありません」と出て、合計はどちらも 0円', async () => {
    installFakeApi({ 'GET /bills': () => json(listResponse()) })
    renderApp('/money')

    expect(await screen.findByText('請求はありません')).toBeInTheDocument()
    expect(screen.getByText('払う額の合計').parentElement).toHaveTextContent('0円')
    expect(screen.getByText('受け取る額の合計').parentElement).toHaveTextContent('0円')
  })

  it('[MONEY-F-004/AC-7] 一覧の API が 500 を返すと「うまく読み込めませんでした。時間をおいてもう一度開いてください。」と出る', async () => {
    installFakeApi({ 'GET /bills': errorResponse(500, 'internal') })
    renderApp('/money')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'うまく読み込めませんでした。時間をおいてもう一度開いてください。',
    )
  })

  it('[MONEY-F-004/AC-8] 通信できないと「通信できません。電波の良いところでもう一度開いてください。」と出る', async () => {
    installFakeApi({ 'GET /bills': networkDown })
    renderApp('/money')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '通信できません。電波の良いところでもう一度開いてください。',
    )
  })

  // AC ではない確認
  it('合計・受け取り待ちの精算・各行（件名・金額・相手・状態・発生日・カテゴリー）が出る。親には「家庭」の合計も出る', async () => {
    installFakeApi({
      'GET /bills': () =>
        json(
          listResponse({
            bills: [billSummary({ title: '歯医者', amount: 3000, status: 'returned' })],
            totals: { self: { pay: 1000, receive: 5000 }, household: { pay: 4000, receive: 2000 } },
            pendingSettlements: [
              {
                id: '40000000-0000-4000-8000-000000000001',
                payer: party('seigo'),
                receiver: party('mother'),
                amount: 2500,
                paidAt: '2026-10-04T03:00:00.000Z',
                side: 'receiver',
              },
            ],
          }),
        ),
    })
    renderApp('/money')

    expect(await screen.findByText('受け取る額の合計')).toBeInTheDocument()
    expect(screen.getByText('受け取る額の合計').parentElement).toHaveTextContent('5,000円')
    expect(screen.getByText('家庭が払う額').parentElement).toHaveTextContent('4,000円')
    expect(screen.getByText('家庭が受け取る額').parentElement).toHaveTextContent('2,000円')
    expect(screen.getByRole('link', { name: /せいごから 2,500円/ })).toBeInTheDocument()

    const row = screen.getByRole('link', { name: /歯医者/ })
    for (const text of ['3,000円', 'せいご → 母', '差し戻し', '2026/10/04', '医療費']) {
      expect(within(row).getByText(text, { exact: false })).toBeInTheDocument()
    }
  })

  it('「片付いた」に切り替えると view=closed で読み直す', async () => {
    const { requests } = installFakeApi({ 'GET /bills': () => json(listResponse()) })
    renderApp('/money')
    await screen.findByText('請求はありません')

    await userEvent.click(screen.getByRole('radio', { name: '片付いた' }))
    await screen.findByText('請求はありません')
    expect(requests.map((r) => new URL(r.url).search)).toContain('?view=closed')
  })

  it('ホームの「お金」を押すとお金の画面へ進む', async () => {
    installFakeApi({ 'GET /me': meRoute(MOTHER), 'GET /bills': () => json(listResponse()) })
    const { router } = renderApp('/')

    await userEvent.click(await screen.findByRole('link', { name: 'お金' }))
    expect(await screen.findByText('請求はありません')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/money')
  })
})
