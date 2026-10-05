import type { SettlementDetail } from '@stylus/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeApi, json } from '../../../test/fakeApi'
import { billSummary, errorResponse, party, signIn } from '../../../test/money'
import { renderApp } from '../../../test/render'

type Handler = Parameters<typeof installFakeApi>[0][string]

const ID = '40000000-0000-4000-8000-000000000001'

// 母がせいごに 2,500円（MONEY-F-011/AC-1 で払われた精算）。sides は見る人の側
function settlement(overrides: Partial<SettlementDetail> = {}): SettlementDetail {
  return {
    id: ID,
    payer: party('mother'),
    receiver: party('seigo'),
    amount: 2500,
    status: 'paid',
    paidByName: '母',
    paidAt: '2026-10-04T03:00:00.000Z',
    confirmedByName: null,
    confirmedAt: null,
    revertedByName: null,
    revertedAt: null,
    bills: [
      billSummary({ title: '歯医者', amount: 3000, status: 'paid' }),
      billSummary({ fromKey: 'mother', toKey: 'seigo', title: '本', amount: 1000, status: 'paid' }),
    ],
    sides: ['receiver'],
    ...overrides,
  }
}

function openSettlement(details: SettlementDetail[], extra: Record<string, Handler> = {}) {
  let i = 0
  const fake = installFakeApi({
    'GET /settlements/:id': () => json(details[Math.min(i++, details.length - 1)]),
    ...extra,
  })
  renderApp(`/money/settlements/${ID}`)
  return fake
}

const postsOf = (requests: Request[]) => requests.filter((r) => r.method === 'POST')

async function chooseInDialog(title: string, choice: string) {
  const dialog = await screen.findByRole('dialog', { name: title })
  await userEvent.click(within(dialog).getByRole('button', { name: choice }))
}

describe('精算の中身の画面（MONEY-F-012・009）', () => {
  beforeEach(() => {
    signIn()
  })

  it('[MONEY-F-012/AC-6] 存在しない精算の ID を開くと「この精算は見つかりません。」と出る', async () => {
    installFakeApi({
      'GET /settlements/:id': errorResponse(404, 'not_found', 'この精算は見つかりません'),
    })
    renderApp(`/money/settlements/${crypto.randomUUID()}`)

    expect(await screen.findByRole('alert')).toHaveTextContent('この精算は見つかりません。')
  })

  // AC ではない確認
  it('相手・精算額・含まれる請求が出る。受け取る側には「まとめて受け取った」「受け取っていない」が出る', async () => {
    openSettlement([settlement()])
    expect(await screen.findByText('母がせいごに 2,500円')).toBeInTheDocument()
    expect(screen.getByText('歯医者', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('本', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'まとめて受け取った' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '受け取っていない' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '払ったを取り消す' })).not.toBeInTheDocument()
  })

  it('払う側には「払ったを取り消す」だけが出る', async () => {
    openSettlement([settlement({ sides: ['payer'] })])
    expect(await screen.findByRole('button', { name: '払ったを取り消す' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'まとめて受け取った' })).not.toBeInTheDocument()
  })

  it('受け取った・戻した精算にはボタンを出さない', async () => {
    openSettlement([settlement({ status: 'confirmed', confirmedByName: 'せいご' })])
    await screen.findByText('母がせいごに 2,500円')
    expect(screen.queryByRole('button', { name: 'まとめて受け取った' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '受け取っていない' })).not.toBeInTheDocument()
  })

  it('「まとめて受け取った」を選ぶと要求が送られ、受け取った精算になる', async () => {
    const { requests } = openSettlement([settlement()], {
      'POST /settlements/:id/confirm': () =>
        json(settlement({ status: 'confirmed', confirmedByName: 'せいご' })),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'まとめて受け取った' }))
    await chooseInDialog('2,500円を受け取ったことにしますか？', '受け取った')

    expect(await screen.findByText('受け取り済み')).toBeInTheDocument()
    expect(postsOf(requests)).toHaveLength(1)
  })

  it('確認で「キャンセル」を選ぶと何も送られない', async () => {
    const { requests } = openSettlement([settlement()])
    await userEvent.click(await screen.findByRole('button', { name: '受け取っていない' }))
    await chooseInDialog('受け取っていないことにしますか？', 'キャンセル')
    expect(postsOf(requests)).toHaveLength(0)
  })

  it('開いた後に相手が戻していたら「精算の中身が変わりました。もう一度確かめてください。」と出て、最新を出す', async () => {
    openSettlement([settlement(), settlement({ status: 'reverted', revertedByName: '母' })], {
      'POST /settlements/:id/confirm': errorResponse(409, 'state_changed'),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'まとめて受け取った' }))
    await chooseInDialog('2,500円を受け取ったことにしますか？', '受け取った')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '精算の中身が変わりました。もう一度確かめてください。',
    )
    expect(await screen.findByText('戻した')).toBeInTheDocument()
  })
})
