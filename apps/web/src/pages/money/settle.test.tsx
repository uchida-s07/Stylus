import type { SettlementPreview } from '@stylus/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeApi, json, meRoute } from '../../../test/fakeApi'
import {
  billSummary,
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
