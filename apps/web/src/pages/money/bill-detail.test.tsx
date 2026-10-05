import type { BillDetail } from '@stylus/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeApi, json } from '../../../test/fakeApi'
import { billDetail, errorResponse, signIn } from '../../../test/money'
import { renderApp } from '../../../test/render'

type Handler = Parameters<typeof installFakeApi>[0][string]

// 請求の中身を開く。GET は呼ばれるたびに details の次の値を返す（最後の値は使い回す）
function openBill(details: BillDetail[], extra: Record<string, Handler> = {}) {
  let i = 0
  const fake = installFakeApi({
    'GET /bills/:id': () => json(details[Math.min(i++, details.length - 1)]),
    ...extra,
  })
  const app = renderApp(`/money/bills/${details[0]!.id}`)
  return { ...fake, ...app }
}

const postsOf = (requests: Request[]) => requests.filter((r) => r.method === 'POST')

async function chooseInDialog(title: string, choice: string) {
  const dialog = await screen.findByRole('dialog', { name: title })
  await userEvent.click(within(dialog).getByRole('button', { name: choice }))
}

describe('請求の中身の画面（MONEY-F-005・003・006）', () => {
  beforeEach(() => {
    signIn()
  })

  it('[MONEY-F-005/AC-4] 存在しない請求の ID を開くと「この請求は見つかりません。」と出る', async () => {
    installFakeApi({
      'GET /bills/:id': errorResponse(404, 'not_found', 'この請求は見つかりません'),
    })
    renderApp(`/money/bills/${crypto.randomUUID()}`)

    expect(await screen.findByRole('alert')).toHaveTextContent('この請求は見つかりません。')
  })

  it('[MONEY-F-003/AC-2] せいごが「取り消す」を押し、確認で「キャンセル」を選ぶと、請求中のまま（要求は送られない）', async () => {
    const { requests } = openBill([billDetail({ sides: ['from'] })])
    await userEvent.click(await screen.findByRole('button', { name: '取り消す' }))
    await chooseInDialog('この請求を取り消しますか？', 'キャンセル')

    expect(postsOf(requests)).toHaveLength(0)
    expect(screen.getByText('請求中')).toBeInTheDocument()
  })

  it('[MONEY-F-006/AC-2] 母が「払った」を押し、確認で「キャンセル」を選ぶと、請求中のまま（要求は送られない）', async () => {
    const { requests } = openBill([billDetail({ sides: ['to'], amount: 3000 })])
    await userEvent.click(await screen.findByRole('button', { name: '払った' }))
    await chooseInDialog('3,000円を払ったことにしますか？', 'キャンセル')

    expect(postsOf(requests)).toHaveLength(0)
    expect(screen.getByText('請求中')).toBeInTheDocument()
  })

  it('[MONEY-F-006/AC-4] 同じ版で開いていた相手が先に「払った」にしていたら、「請求の状態が変わりました。もう一度開いてください。」と出る', async () => {
    const opened = billDetail({ toKey: null, sides: ['to'] })
    openBill([opened, { ...opened, status: 'paid', version: 2 }], {
      'POST /bills/:id/pay': errorResponse(409, 'state_changed'),
    })
    await userEvent.click(await screen.findByRole('button', { name: '払った' }))
    await chooseInDialog('3,000円を払ったことにしますか？', '払った')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '請求の状態が変わりました。もう一度開いてください。',
    )
    expect(await screen.findByText('支払済')).toBeInTheDocument()
  })

  it('[MONEY-F-006/AC-5] 開いた後にせいごが 2,500円 に直していたら、「請求の中身が変わりました。もう一度確かめてください。」と出て、2,500円 と表示される', async () => {
    const opened = billDetail({ sides: ['to'], amount: 3000 })
    openBill([opened, { ...opened, amount: 2500, version: 2 }], {
      'POST /bills/:id/pay': errorResponse(409, 'state_changed'),
    })
    await userEvent.click(await screen.findByRole('button', { name: '払った' }))
    await chooseInDialog('3,000円を払ったことにしますか？', '払った')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '請求の中身が変わりました。もう一度確かめてください。',
    )
    expect(await screen.findByText('2,500円')).toBeInTheDocument()
    expect(screen.getByText('請求中')).toBeInTheDocument()
  })

  // AC ではない確認
  it('状態と側に合うボタンだけが出る', async () => {
    openBill([billDetail({ status: 'paid', sides: ['from'] })])
    await screen.findByText('支払済')
    const names = screen.getAllByRole('button').map((b) => b.textContent)
    expect(names).toEqual(expect.arrayContaining(['受け取った', '受け取っていない']))
    expect(names).not.toContain('払った')
    expect(names).not.toContain('取り消す')
  })

  it('精算に入った請求は「受け取った」・戻すを出さず、精算の中身へ進める', async () => {
    const settlementId = '40000000-0000-4000-8000-000000000001'
    openBill([billDetail({ status: 'paid', sides: ['from'], settlementId })])
    await screen.findByText('支払済')
    expect(screen.queryByRole('button', { name: '受け取った' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '精算の中身を見る' })).toHaveAttribute(
      'href',
      `/money/settlements/${settlementId}`,
    )
  })

  it('経過は種類・操作した家族・理由・日時（日本時間）を古い順に出す。メモが空ならメモの欄を出さない', async () => {
    openBill([
      billDetail({
        status: 'returned',
        memo: null,
        events: [
          {
            kind: 'created',
            actorName: 'せいご',
            reason: null,
            settlement: null,
            createdAt: '2026-10-01T01:00:00.000Z',
          },
          {
            kind: 'returned',
            actorName: '母',
            reason: '金額が違う',
            settlement: null,
            createdAt: '2026-10-02T11:00:00.000Z',
          },
        ],
      }),
    ])
    const items = await screen.findAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('登録（せいご）'),
      expect.stringContaining('差し戻した（母）：金額が違う'),
    ])
    expect(items[0]).toHaveTextContent('2026/10/01 10:00')
    expect(screen.queryByText('メモ')).not.toBeInTheDocument()
  })

  it('「払った」を選ぶと要求が送られ、支払済になる', async () => {
    const opened = billDetail({ sides: ['to'] })
    const { requests } = openBill([opened], {
      'POST /bills/:id/pay': () => json({ ...opened, status: 'paid', version: 2 }),
    })
    await userEvent.click(await screen.findByRole('button', { name: '払った' }))
    await chooseInDialog('3,000円を払ったことにしますか？', '払った')

    expect(await screen.findByText('支払済')).toBeInTheDocument()
    expect(await postsOf(requests)[0]!.clone().json()).toEqual({ version: 1 })
  })
})
