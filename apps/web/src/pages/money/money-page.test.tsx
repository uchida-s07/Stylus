import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeApi, json, meRoute, MOTHER, networkDown } from '../../../test/fakeApi'
import { billSummary, errorResponse, listResponse, meOf, party, signIn } from '../../../test/money'
import { renderApp } from '../../../test/render'

// お金の画面の偽物の API。自分の情報は既定でせいご
function installMoneyApi(routes: Parameters<typeof installFakeApi>[0]) {
  return installFakeApi({ 'GET /me': meRoute(meOf('seigo')), ...routes })
}

describe('お金の画面（MONEY-F-004）', () => {
  beforeEach(() => {
    signIn()
    localStorage.removeItem('stylus.money.billTab')
  })

  it('[MONEY-F-004/AC-9] せいごが「受け取り」のタブを選ぶと せいご→母 が出て 母→せいご は出ず、「支払い」のタブには 母→せいご だけが出る', async () => {
    installMoneyApi({
      'GET /bills': () =>
        json(
          listResponse({
            bills: [
              billSummary({ fromKey: 'seigo', toKey: 'mother', title: '歯医者', amount: 3000 }),
              billSummary({ fromKey: 'mother', toKey: 'seigo', title: '本', amount: 1000 }),
            ],
          }),
        ),
    })
    renderApp('/money')

    expect(await screen.findByRole('link', { name: /本/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /歯医者/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: '受け取り' }))
    expect(await screen.findByRole('link', { name: /歯医者/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /本/ })).not.toBeInTheDocument()
  })

  // AC ではない確認
  it('開いたときは前回選んだタブを出す（初めては「支払い」）。親には「家庭」の請求も側で分けて出す', async () => {
    installMoneyApi({
      'GET /me': meRoute(meOf('mother')),
      'GET /bills': () =>
        json(
          listResponse({
            bills: [
              billSummary({ fromKey: 'seigo', toKey: null, title: '定期代' }),
              billSummary({ fromKey: null, toKey: 'kugo', title: '修理代' }),
            ],
          }),
        ),
    })
    const first = renderApp('/money')
    expect(await screen.findByRole('tab', { name: '支払い', selected: true })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /定期代/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: '受け取り' }))
    expect(await screen.findByRole('link', { name: /修理代/ })).toBeInTheDocument()
    first.unmount()

    renderApp('/money')
    expect(await screen.findByRole('tab', { name: '受け取り', selected: true })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /修理代/ })).toBeInTheDocument()
  })

  it('[MONEY-F-004/AC-4] くうごが関係する請求が1件も無いと、「請求はありません」と出て、合計はどちらも 0円', async () => {
    installMoneyApi({ 'GET /bills': () => json(listResponse()) })
    renderApp('/money')

    expect(await screen.findByText('請求はありません')).toBeInTheDocument()
    expect(screen.getByText('払う額の合計').parentElement).toHaveTextContent('0円')
    expect(screen.getByText('受け取る額の合計').parentElement).toHaveTextContent('0円')
  })

  it('[MONEY-F-004/AC-7] 一覧の API が 500 を返すと「うまく読み込めませんでした。時間をおいてもう一度開いてください。」と出る', async () => {
    installMoneyApi({ 'GET /bills': errorResponse(500, 'internal') })
    renderApp('/money')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'うまく読み込めませんでした。時間をおいてもう一度開いてください。',
    )
  })

  it('[MONEY-F-004/AC-8] 通信できないと「通信できません。電波の良いところでもう一度開いてください。」と出る', async () => {
    installMoneyApi({ 'GET /bills': networkDown })
    renderApp('/money')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '通信できません。電波の良いところでもう一度開いてください。',
    )
  })

  // AC ではない確認
  it('合計・受け取り待ちの精算・各行（件名・金額・相手・状態・発生日・カテゴリー）が出る。親には「家庭」の合計も出る', async () => {
    installMoneyApi({
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

    // せいご→母 は、せいごの「受け取り」
    await userEvent.click(screen.getByRole('tab', { name: '受け取り' }))
    const row = screen.getByRole('link', { name: /歯医者/ })
    for (const text of ['3,000円', 'せいご → 母', '差し戻し', '2026/10/04', '医療費']) {
      expect(within(row).getByText(text, { exact: false })).toBeInTheDocument()
    }
  })

  it('お金の画面は片付いていない請求だけを読み、切り替えは無い', async () => {
    const { requests } = installMoneyApi({ 'GET /bills': () => json(listResponse()) })
    renderApp('/money')
    await screen.findByText('請求はありません')

    const bills = requests.filter((r) => new URL(r.url).pathname === '/bills')
    expect(bills.map((r) => new URL(r.url).search)).toEqual(['?view=open'])
    expect(screen.queryByRole('radio', { name: '片付いた' })).not.toBeInTheDocument()
  })

  it.each([
    ['履歴', '/money/history'],
    ['カテゴリーの編集', '/money/categories'],
  ])('右上のメニューの「%s」から %s へ進む', async (name, path) => {
    installMoneyApi({
      'GET /bills': () => json(listResponse()),
      'GET /bill-categories': () => json({ categories: [] }),
    })
    const { router } = renderApp('/money')
    await screen.findByText('請求はありません')

    await userEvent.click(screen.getByRole('button', { name: 'メニュー' }))
    await userEvent.click(await screen.findByRole('menuitem', { name }))
    expect(router.state.location.pathname).toBe(path)
  })

  it('ホームの「お金」を押すとお金の画面へ進む', async () => {
    installMoneyApi({ 'GET /me': meRoute(MOTHER), 'GET /bills': () => json(listResponse()) })
    const { router } = renderApp('/')

    await userEvent.click(await screen.findByRole('link', { name: 'お金' }))
    expect(await screen.findByText('請求はありません')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/money')
  })
})

describe('受け取り待ちの精算（MONEY-F-011）', () => {
  beforeEach(() => {
    signIn()
  })

  it('[MONEY-F-011/AC-1] 母がまとめて払った後、せいごのお金の画面に受け取り待ちの精算「母から 2,500円」が出る', async () => {
    installMoneyApi({
      'GET /bills': () =>
        json(
          listResponse({
            pendingSettlements: [
              {
                id: '40000000-0000-4000-8000-000000000001',
                payer: party('mother'),
                receiver: party('seigo'),
                amount: 2500,
                paidAt: '2026-10-04T03:00:00.000Z',
                side: 'receiver',
              },
            ],
          }),
        ),
    })
    renderApp('/money')

    expect(await screen.findByRole('link', { name: /母から 2,500円/ })).toHaveAttribute(
      'href',
      '/money/settlements/40000000-0000-4000-8000-000000000001',
    )
  })
})
