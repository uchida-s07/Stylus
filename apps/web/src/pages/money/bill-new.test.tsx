import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeApi, json, meRoute, networkDown } from '../../../test/fakeApi'
import {
  billSummary,
  CATEGORIES,
  deferred,
  errorResponse,
  FAMILY,
  listResponse,
  MEMBERS,
  meOf,
  signIn,
} from '../../../test/money'
import { renderApp } from '../../../test/render'

type Handler = Parameters<typeof installFakeApi>[0][string]

// せいごが請求の入力を開く（POST /bills の応答を差し替えられる）
function openAsSeigo(postBills: Handler, extra: Record<string, Handler> = {}) {
  const fake = installFakeApi({
    'GET /me': meRoute(meOf('seigo')),
    'GET /members': () => json(MEMBERS),
    'GET /bill-categories': () => json(CATEGORIES),
    'POST /bills': postBills,
    'GET /bills': () => json(listResponse()),
    ...extra,
  })
  const app = renderApp('/money/bills/new')
  return { ...fake, ...app }
}

// AC-1 と同じ値（請求先「母」・金額 3,000・カテゴリー「医療費」・件名「歯医者」・発生日 2026-10-04）を入れる
async function fillAc1Values() {
  await userEvent.selectOptions(await screen.findByLabelText('請求先'), '母')
  await userEvent.type(screen.getByLabelText('金額'), '3000')
  await userEvent.selectOptions(screen.getByLabelText('カテゴリー'), '医療費')
  await userEvent.type(screen.getByLabelText('件名'), '歯医者')
  const date = screen.getByLabelText('発生日')
  await userEvent.clear(date)
  await userEvent.type(date, '2026-10-04')
}

const submit = () => userEvent.click(screen.getByRole('button', { name: '請求する' }))
const postsOf = (requests: Request[]) => requests.filter((r) => r.method === 'POST')

describe('請求の入力の画面（MONEY-F-001）', () => {
  beforeEach(() => {
    signIn()
  })

  it('[MONEY-F-001/AC-3] 件名を空白だけにして「請求する」を押すと、請求は作られず、件名に「入力してください」と出る', async () => {
    const { requests } = openAsSeigo(() => json(billSummary(), 201))
    await fillAc1Values()
    await userEvent.clear(screen.getByLabelText('件名'))
    await userEvent.type(screen.getByLabelText('件名'), '　 ')
    await submit()

    expect(screen.getByLabelText('件名')).toHaveAccessibleDescription('入力してください')
    expect(postsOf(requests)).toHaveLength(0)
  })

  it('[MONEY-F-001/AC-11] 選んだカテゴリーが削除されていたら、「カテゴリーが見つかりません。選び直してください」と出る', async () => {
    openAsSeigo(
      errorResponse(400, 'invalid_input', '入力が正しくありません', {
        categoryId: 'カテゴリーが見つかりません。選び直してください',
      }),
    )
    await fillAc1Values()
    await submit()

    expect(await screen.findByLabelText('カテゴリー')).toHaveAccessibleDescription(
      'カテゴリーが見つかりません。選び直してください',
    )
  })

  it('[MONEY-F-001/AC-12] カテゴリーが1つも無いと、「先にカテゴリーを追加してください」と出て、カテゴリーの追加へ進める', async () => {
    installFakeApi({
      'GET /me': meRoute(meOf('seigo')),
      'GET /members': () => json(MEMBERS),
      'GET /bill-categories': () => json({ categories: [] }),
    })
    renderApp('/money/bills/new')

    expect(await screen.findByText('先にカテゴリーを追加してください')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'カテゴリーを追加する' })).toHaveAttribute(
      'href',
      '/money/categories',
    )
  })

  it('[MONEY-F-001/AC-13] 通信できないと「通信できません。電波の良いところでもう一度お試しください。」と出て、入力した内容が残っている', async () => {
    openAsSeigo(networkDown)
    await fillAc1Values()
    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '通信できません。電波の良いところでもう一度お試しください。',
    )
    expect(screen.getByLabelText('請求先')).toHaveValue(FAMILY.mother.id)
    expect(screen.getByLabelText('金額')).toHaveValue('3000')
    expect(screen.getByLabelText('カテゴリー')).toHaveValue(CATEGORIES.categories[0]!.id)
    expect(screen.getByLabelText('件名')).toHaveValue('歯医者')
    expect(screen.getByLabelText('発生日')).toHaveValue('2026-10-04')
  })

  it('[MONEY-F-001/AC-14] 「請求する」を続けて2回押しても、送られる要求は1回だけ', async () => {
    const pending = deferred(() => json(billSummary(), 201))
    const { requests } = openAsSeigo(pending.handler)
    await fillAc1Values()
    const button = screen.getByRole('button', { name: '請求する' })
    await userEvent.click(button)
    await userEvent.click(button)
    pending.release()

    await waitFor(() => expect(screen.getByRole('main', { name: 'お金' })).toBeInTheDocument())
    expect(postsOf(requests)).toHaveLength(1)
  })

  it('[MONEY-F-001/AC-16] 最初の登録が保存されていたのに金額を直して押し直すと、「この請求はすでに登録されています。一覧で確かめて、必要なら直してください。」と出る', async () => {
    let calls = 0
    const { requests } = openAsSeigo(() => {
      calls += 1
      if (calls === 1) throw new TypeError('Failed to fetch')
      return errorResponse(
        409,
        'already_registered',
        'この請求はすでに登録されています。一覧で確かめて、必要なら直してください。',
      )()
    })
    await fillAc1Values()
    await submit()
    await screen.findByRole('alert')
    await userEvent.clear(screen.getByLabelText('金額'))
    await userEvent.type(screen.getByLabelText('金額'), '3500')
    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'この請求はすでに登録されています。一覧で確かめて、必要なら直してください。',
    )
    // 送り直しでも同じ request_id を送る
    const bodies = await Promise.all(postsOf(requests).map((r) => r.clone().json()))
    expect(bodies).toHaveLength(2)
    expect(bodies[0].requestId).toBe(bodies[1].requestId)
  })

  // AC ではない確認
  it('登録できたらお金の画面へ戻る。送る中身は入力のとおり', async () => {
    const { requests } = openAsSeigo(() => json(billSummary(), 201))
    await fillAc1Values()
    await submit()

    expect(await screen.findByRole('main', { name: 'お金' })).toBeInTheDocument()
    const [body] = await Promise.all(postsOf(requests).map((r) => r.clone().json()))
    expect(body).toMatchObject({
      as: 'self',
      to: FAMILY.mother.id,
      amount: 3000,
      categoryId: CATEGORIES.categories[0]!.id,
      title: '歯医者',
      occurredOn: '2026-10-04',
    })
  })

  it('請求先に自分は出ない。息子は「家庭」を選べる。名義は親にだけ出る', async () => {
    openAsSeigo(() => json(billSummary(), 201))
    const to = await screen.findByLabelText('請求先')
    const options = [...(to as HTMLSelectElement).options].map((o) => o.textContent)
    expect(options).toEqual(expect.arrayContaining(['父', '母', 'くうご', '家庭']))
    expect(options).not.toContain('せいご')
    expect(screen.queryByText('名義')).not.toBeInTheDocument()
  })

  it('親が名義「家庭」を選ぶと、請求先は息子だけになる', async () => {
    installFakeApi({
      'GET /me': meRoute(meOf('mother')),
      'GET /members': () => json(MEMBERS),
      'GET /bill-categories': () => json(CATEGORIES),
    })
    renderApp('/money/bills/new')
    const to = await screen.findByLabelText('請求先')
    expect([...(to as HTMLSelectElement).options].map((o) => o.textContent)).not.toContain('家庭')

    await userEvent.click(screen.getByRole('radio', { name: '家庭' }))
    const options = [...(screen.getByLabelText('請求先') as HTMLSelectElement).options]
      .map((o) => o.textContent)
      .filter((t) => t !== '選んでください')
    expect(options).toEqual(['せいご', 'くうご'])
  })
})
