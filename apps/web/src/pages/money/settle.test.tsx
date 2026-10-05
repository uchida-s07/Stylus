import type { SettlementPreview } from '@stylus/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeApi, json, meRoute } from '../../../test/fakeApi'
import {
  billSummary,
  deferred,
  errorResponse,
  FAMILY,
  MEMBERS,
  meOf,
  party,
  signIn,
  type FamilyKey,
} from '../../../test/money'
import { renderApp } from '../../../test/render'

type Handler = Parameters<typeof installFakeApi>[0][string]

// せいごと母の間（MONEY-F-010/AC-1）：せいご→母 3,000・500、母→せいご 1,000
function preview(overrides: Partial<SettlementPreview> = {}): SettlementPreview {
  return {
    self: party('seigo'),
    counterpart: party('mother'),
    bills: [
      billSummary({ fromKey: 'seigo', toKey: 'mother', amount: 3000 }),
      billSummary({ fromKey: 'seigo', toKey: 'mother', amount: 500 }),
      billSummary({ fromKey: 'mother', toKey: 'seigo', amount: 1000 }),
    ],
    selfRequestedTotal: 3500,
    counterpartRequestedTotal: 1000,
    amount: 2500,
    payer: 'counterpart',
    ...overrides,
  }
}

// 精算の画面を開く。GET /settlements/preview は呼ばれるたびに previews の次の値を返す
function openSettle(
  who: FamilyKey,
  previews: SettlementPreview[],
  extra: Record<string, Handler> = {},
) {
  let i = 0
  const fake = installFakeApi({
    'GET /me': meRoute(meOf(who)),
    'GET /members': () => json(MEMBERS),
    'GET /settlements/preview': () => json(previews[Math.min(i++, previews.length - 1)]),
    ...extra,
  })
  const app = renderApp('/money/settle')
  return { ...fake, ...app }
}

async function chooseCounterpart(name: string) {
  await userEvent.selectOptions(await screen.findByLabelText('相手'), name)
}

describe('精算の画面（MONEY-F-010）', () => {
  beforeEach(() => {
    signIn()
  })

  it('[MONEY-F-010/AC-1] せいごが相手「母」の精算を開くと、せいご→母 の小計 3,500円、母→せいご の小計 1,000円、精算額「母がせいごに 2,500円」と出る', async () => {
    const { requests } = openSettle('seigo', [preview()])
    await chooseCounterpart('母')

    expect(await screen.findByText('母がせいごに 2,500円')).toBeInTheDocument()
    expect(screen.getByText('せいご → 母').parentElement).toHaveTextContent('3,500円')
    expect(screen.getByText('母 → せいご').parentElement).toHaveTextContent('1,000円')
    const url = new URL(requests.find((r) => r.url.includes('preview'))!.url)
    expect(url.searchParams.get('as')).toBe('self')
    expect(url.searchParams.get('counterpart')).toBe(FAMILY.mother.id)
  })

  it('[MONEY-F-010/AC-3] くうごと父の間に請求中の請求が無いと「精算する請求はありません」と出る', async () => {
    openSettle('kugo', [
      preview({
        self: party('kugo'),
        counterpart: party('father'),
        bills: [],
        selfRequestedTotal: 0,
        counterpartRequestedTotal: 0,
        amount: 0,
        payer: null,
      }),
    ])
    await chooseCounterpart('父')

    expect(await screen.findByText('精算する請求はありません')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'まとめて払った' })).not.toBeInTheDocument()
  })

  it('[MONEY-F-010/AC-4] せいご→母 1,000円・母→せいご 1,000円 なら「差し引き 0円（お金のやり取りはありません）」と出る', async () => {
    openSettle('seigo', [
      preview({
        bills: [
          billSummary({ fromKey: 'seigo', toKey: 'mother', amount: 1000 }),
          billSummary({ fromKey: 'mother', toKey: 'seigo', amount: 1000 }),
        ],
        selfRequestedTotal: 1000,
        counterpartRequestedTotal: 1000,
        amount: 0,
        payer: null,
      }),
    ])
    await chooseCounterpart('母')

    expect(
      await screen.findByText('差し引き 0円（お金のやり取りはありません）'),
    ).toBeInTheDocument()
  })

  // AC ではない確認
  it('相手の選択肢に自分は出ない。息子は「家庭」を選べる。名義は親にだけ出る', async () => {
    openSettle('seigo', [preview()])
    const select = (await screen.findByLabelText('相手')) as HTMLSelectElement
    const options = [...select.options].map((o) => o.textContent)
    expect(options).toEqual(expect.arrayContaining(['父', '母', 'くうご', '家庭']))
    expect(options).not.toContain('せいご')
    expect(screen.queryByText('名義')).not.toBeInTheDocument()
  })

  it('親は名義「家庭」を選べ、そのとき相手は息子だけ', async () => {
    openSettle('mother', [preview({ self: party(null), counterpart: party('seigo') })])
    await userEvent.click(await screen.findByRole('radio', { name: '家庭' }))
    const select = screen.getByLabelText('相手') as HTMLSelectElement
    expect(
      [...select.options].map((o) => o.textContent).filter((t) => t !== '選んでください'),
    ).toEqual(['せいご', 'くうご'])
  })

  it('受け取る側には「まとめて払った」を出さない', async () => {
    openSettle('seigo', [preview()])
    await chooseCounterpart('母')
    await screen.findByText('母がせいごに 2,500円')
    expect(screen.queryByRole('button', { name: 'まとめて払った' })).not.toBeInTheDocument()
  })

  it('精算額の読み込みで通信できないと「通信できません。電波の良いところでもう一度開いてください。」', async () => {
    installFakeApi({
      'GET /me': meRoute(meOf('seigo')),
      'GET /members': () => json(MEMBERS),
      'GET /settlements/preview': () => {
        throw new TypeError('Failed to fetch')
      },
    })
    renderApp('/money/settle')
    await chooseCounterpart('母')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '通信できません。電波の良いところでもう一度開いてください。',
    )
  })

  it('一覧には向きごとに請求が並ぶ', async () => {
    openSettle('seigo', [preview()])
    await chooseCounterpart('母')
    const group = (await screen.findByText('せいご → 母')).closest('section')!
    expect(within(group).getAllByRole('listitem')).toHaveLength(2)
  })
})

// 母から見た MONEY-F-010/AC-1 の精算（母がせいごに 2,500円）
function motherPreview(overrides: Partial<SettlementPreview> = {}): SettlementPreview {
  return preview({
    self: party('mother'),
    counterpart: party('seigo'),
    selfRequestedTotal: 1000,
    counterpartRequestedTotal: 3500,
    amount: 2500,
    payer: 'self',
    ...overrides,
  })
}

const SETTLEMENT_ID = '40000000-0000-4000-8000-000000000001'
const postsOf = (requests: Request[]) => requests.filter((r) => r.method === 'POST')

async function payAll(
  choice: '払った' | 'キャンセル',
  title = '母がせいごに 2,500円 払ったことにしますか？',
) {
  await userEvent.click(await screen.findByRole('button', { name: 'まとめて払った' }))
  const dialog = await screen.findByRole('dialog', { name: title })
  await userEvent.click(within(dialog).getByRole('button', { name: choice }))
}

describe('まとめて払った（MONEY-F-011）', () => {
  beforeEach(() => {
    signIn()
  })

  it('[MONEY-F-011/AC-1] 母が相手「せいご」の精算で「まとめて払った」を押し、確認で「払った」を選ぶと、見ていた請求と精算額を送り、精算の中身へ進む', async () => {
    const p = motherPreview()
    const { requests, visited } = openSettle('mother', [p], {
      'POST /settlements': () => json({ id: SETTLEMENT_ID }, 201),
    })
    await chooseCounterpart('せいご')
    await payAll('払った')

    await waitFor(() => expect(visited).toContain(`/money/settlements/${SETTLEMENT_ID}`))
    expect(await postsOf(requests)[0]!.clone().json()).toEqual({
      as: 'self',
      counterpart: FAMILY.seigo.id,
      bills: p.bills.map((b) => ({ id: b.id, version: b.version })),
      amount: 2500,
      payer: 'self',
    })
  })

  it('[MONEY-F-011/AC-2] 「まとめて払った」を押し、確認で「キャンセル」を選ぶと、何も送られない', async () => {
    const { requests } = openSettle('mother', [motherPreview()])
    await chooseCounterpart('せいご')
    await payAll('キャンセル')

    expect(postsOf(requests)).toHaveLength(0)
    expect(screen.getByText('母がせいごに 2,500円')).toBeInTheDocument()
  })

  it('[MONEY-F-011/AC-4] 母が精算を開いた後に請求が増えていたら、「精算の中身が変わりました。もう一度確かめてください。」と出て、精算額「母がせいごに 3,500円」が出る', async () => {
    openSettle(
      'mother',
      [motherPreview(), motherPreview({ counterpartRequestedTotal: 4500, amount: 3500 })],
      { 'POST /settlements': errorResponse(409, 'state_changed') },
    )
    await chooseCounterpart('せいご')
    await payAll('払った')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '精算の中身が変わりました。もう一度確かめてください。',
    )
    expect(await screen.findByText('母がせいごに 3,500円')).toBeInTheDocument()
  })

  it('[MONEY-F-011/AC-7] 保存に失敗すると「保存できませんでした。時間をおいてもう一度お試しください。」と出る', async () => {
    openSettle('mother', [motherPreview()], {
      'POST /settlements': errorResponse(500, 'internal'),
    })
    await chooseCounterpart('せいご')
    await payAll('払った')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '保存できませんでした。時間をおいてもう一度お試しください。',
    )
  })

  // AC ではない確認（tasks.md D-4）
  it('送っている間は押せず、確認の「払った」を続けて押しても送るのは1回だけ', async () => {
    const pending = deferred(() => json({ id: SETTLEMENT_ID }, 201))
    const { requests } = openSettle('mother', [motherPreview()], {
      'POST /settlements': pending.handler,
    })
    await chooseCounterpart('せいご')
    await userEvent.click(await screen.findByRole('button', { name: 'まとめて払った' }))
    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: '払った' })
    await userEvent.click(confirm)
    await userEvent.click(confirm)
    pending.release()

    await waitFor(() => expect(postsOf(requests)).toHaveLength(1))
  })

  it('差し引き 0円 なら、押した側が払う側として送る', async () => {
    const p = preview({
      amount: 0,
      payer: null,
      selfRequestedTotal: 1000,
      counterpartRequestedTotal: 1000,
    })
    const { requests } = openSettle('seigo', [p], {
      'POST /settlements': () => json({ id: SETTLEMENT_ID }, 201),
    })
    await chooseCounterpart('母')
    await payAll('払った', 'せいごが母に 0円 払ったことにしますか？')

    await waitFor(() => expect(postsOf(requests)).toHaveLength(1))
    expect(await postsOf(requests)[0]!.clone().json()).toMatchObject({ amount: 0, payer: 'self' })
  })
})
