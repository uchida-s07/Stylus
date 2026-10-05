import type { BillDetail } from '@stylus/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeApi, json, meRoute } from '../../../test/fakeApi'
import { billDetail, CATEGORIES, errorResponse, MEMBERS, meOf, signIn } from '../../../test/money'
import { renderApp } from '../../../test/render'

type Handler = Parameters<typeof installFakeApi>[0][string]

const postsOf = (requests: Request[]) => requests.filter((r) => r.method !== 'GET')

// GET /bills/:id は呼ばれるたびに details の次の値を返す（最後の値は使い回す）
function billRoutes(details: BillDetail[], extra: Record<string, Handler> = {}) {
  let i = 0
  return installFakeApi({
    'GET /me': meRoute(meOf('seigo')),
    'GET /members': () => json(MEMBERS),
    'GET /bill-categories': () => json(CATEGORIES),
    'GET /bills/:id': () => json(details[Math.min(i++, details.length - 1)]),
    ...extra,
  })
}

describe('差し戻す（MONEY-F-008）', () => {
  beforeEach(() => {
    signIn()
  })

  async function openReturn(extra: Record<string, Handler> = {}) {
    const fake = billRoutes([billDetail({ sides: ['to'] })], extra)
    renderApp(`/money/bills/${billDetail().id}`)
    await userEvent.click(await screen.findByRole('button', { name: '差し戻す' }))
    const dialog = await screen.findByRole('dialog', { name: '差し戻す' })
    return { ...fake, dialog }
  }

  it('[MONEY-F-008/AC-2] 母が理由を空白だけにして「差し戻す」を押すと、請求中のままで「理由を入力してください」と出る', async () => {
    const { requests, dialog } = await openReturn()
    await userEvent.type(within(dialog).getByLabelText('理由'), '　 ')
    await userEvent.click(within(dialog).getByRole('button', { name: '差し戻す' }))

    expect(within(dialog).getByLabelText('理由')).toHaveAccessibleDescription(
      '理由を入力してください',
    )
    expect(postsOf(requests)).toHaveLength(0)
  })

  // AC ではない確認
  it('理由を入れて「差し戻す」を押すと、理由と版を送り、差し戻しになる', async () => {
    const opened = billDetail({ sides: ['to'] })
    const { requests, dialog } = await openReturn({
      'POST /bills/:id/return': () => json({ ...opened, status: 'returned', version: 2 }),
    })
    await userEvent.type(within(dialog).getByLabelText('理由'), '金額が違う')
    await userEvent.click(within(dialog).getByRole('button', { name: '差し戻す' }))

    expect(await screen.findByText('差し戻し')).toBeInTheDocument()
    expect(await postsOf(requests)[0]!.clone().json()).toEqual({ version: 1, reason: '金額が違う' })
  })
})

describe('直す・出し直す（MONEY-F-002）', () => {
  beforeEach(() => {
    signIn()
  })

  it('[MONEY-F-002/AC-5] 直す画面を開いている間に母が「払った」にしていたら、保存すると「請求の状態が変わりました。もう一度開いてください。」と出る', async () => {
    const opened = billDetail({ sides: ['from'], amount: 3000 })
    billRoutes([opened, { ...opened, status: 'paid', version: 2 }], {
      'PATCH /bills/:id': errorResponse(409, 'state_changed'),
    })
    renderApp(`/money/bills/${opened.id}/edit`)
    const amount = await screen.findByLabelText('金額')
    await userEvent.clear(amount)
    await userEvent.type(amount, '2500')
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '請求の状態が変わりました。もう一度開いてください。',
    )
  })

  // AC ではない確認
  it('直す画面は今の値で始まり、保存すると請求の中身の画面へ戻る', async () => {
    const opened = billDetail({ sides: ['from'], amount: 3000, title: '歯医者', memo: '保険証' })
    const { requests } = billRoutes([opened], {
      'PATCH /bills/:id': () => json({ ...opened, amount: 2500, version: 2 }),
    })
    const { router } = renderApp(`/money/bills/${opened.id}/edit`)
    expect(await screen.findByLabelText('金額')).toHaveValue('3000')
    expect(screen.getByLabelText('件名')).toHaveValue('歯医者')
    expect(screen.getByLabelText('メモ')).toHaveValue('保険証')
    expect(screen.queryByLabelText('請求先')).not.toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('金額'))
    await userEvent.type(screen.getByLabelText('金額'), '2500')
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))

    await screen.findByRole('main', { name: '請求' })
    expect(router.state.location.pathname).toBe(`/money/bills/${opened.id}`)
    expect(await postsOf(requests)[0]!.clone().json()).toMatchObject({ version: 1, amount: 2500 })
  })

  it('差し戻しの請求は「出し直す」で送る', async () => {
    const opened = billDetail({ sides: ['from'], status: 'returned' })
    billRoutes([opened])
    renderApp(`/money/bills/${opened.id}/edit`)
    expect(await screen.findByRole('button', { name: '出し直す' })).toBeInTheDocument()
  })
})
