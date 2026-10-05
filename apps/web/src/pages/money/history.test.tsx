import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeApi, json } from '../../../test/fakeApi'
import { billSummary, listResponse, signIn } from '../../../test/money'
import { renderApp } from '../../../test/render'

describe('履歴（MONEY-F-004）', () => {
  beforeEach(() => {
    signIn()
  })

  it('[MONEY-F-004/AC-6] せいご→母 の確認済の請求と取消の請求は、せいごが履歴を開くと出る', async () => {
    const { requests } = installFakeApi({
      'GET /bills': (request) =>
        new URL(request.url).searchParams.get('view') === 'closed'
          ? json(
              listResponse({
                bills: [
                  billSummary({ title: '歯医者', status: 'confirmed' }),
                  billSummary({ title: '薬', status: 'canceled' }),
                ],
              }),
            )
          : json(listResponse()),
    })
    renderApp('/money/history')

    expect(await screen.findByRole('link', { name: /歯医者/ })).toHaveTextContent('確認済')
    expect(screen.getByRole('link', { name: /薬/ })).toHaveTextContent('取消')
    expect(requests.map((r) => new URL(r.url).search)).toEqual(['?view=closed'])
  })

  // AC ではない確認
  it('片付いた請求が無いと「片付いた請求はありません」と出る', async () => {
    installFakeApi({ 'GET /bills': () => json(listResponse()) })
    renderApp('/money/history')
    expect(await screen.findByText('片付いた請求はありません')).toBeInTheDocument()
  })
})
