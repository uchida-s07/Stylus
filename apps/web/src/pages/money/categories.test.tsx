import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeApi, json } from '../../../test/fakeApi'
import { CATEGORIES, errorResponse, signIn } from '../../../test/money'
import { renderApp } from '../../../test/render'

type Handler = Parameters<typeof installFakeApi>[0][string]

const SCHOOL = { id: '20000000-0000-4000-8000-000000000009', name: '学費' }
const WITH_SCHOOL = { categories: [...CATEGORIES.categories, SCHOOL] }

function openCategories(extra: Record<string, Handler> = {}, list = WITH_SCHOOL) {
  const fake = installFakeApi({ 'GET /bill-categories': () => json(list), ...extra })
  renderApp('/money/categories')
  return fake
}

const writes = (requests: Request[]) => requests.filter((r) => r.method !== 'GET')

async function addCategory(name: string) {
  await userEvent.type(await screen.findByLabelText('名前'), name)
  await userEvent.click(screen.getByRole('button', { name: '追加する' }))
}

async function deleteSchool(choice: '削除する' | 'キャンセル') {
  await userEvent.click(await screen.findByRole('button', { name: '学費を削除' }))
  const dialog = await screen.findByRole('dialog', { name: '「学費」を削除しますか？' })
  await userEvent.click(within(dialog).getByRole('button', { name: choice }))
}

describe('カテゴリーの画面（MONEY-F-013・014）', () => {
  beforeEach(() => {
    signIn()
  })

  it('[MONEY-F-013/AC-3] 名前を空白だけにして追加すると、追加されず「入力してください」と出る', async () => {
    const { requests } = openCategories()
    await addCategory('　 ')

    expect(screen.getByLabelText('名前')).toHaveAccessibleDescription('入力してください')
    expect(writes(requests)).toHaveLength(0)
  })

  it('[MONEY-F-013/AC-4] 同じ名前のカテゴリーがあると「同じ名前のカテゴリーがあります」と出る', async () => {
    openCategories({
      'POST /bill-categories': errorResponse(
        409,
        'duplicate_name',
        '同じ名前のカテゴリーがあります',
      ),
    })
    await addCategory('　医療費　')

    expect(screen.getByLabelText('名前')).toHaveAccessibleDescription(
      '同じ名前のカテゴリーがあります',
    )
  })

  it('[MONEY-F-014/AC-2] 請求に使われているカテゴリーを削除すると「このカテゴリーは請求で使われているため削除できません」と出る', async () => {
    openCategories({
      'DELETE /bill-categories/:id': errorResponse(
        409,
        'in_use',
        'このカテゴリーは請求で使われているため削除できません',
      ),
    })
    await deleteSchool('削除する')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'このカテゴリーは請求で使われているため削除できません',
    )
    expect(screen.getByText('学費')).toBeInTheDocument()
  })

  it('[MONEY-F-014/AC-3] 削除を押し、確認で「キャンセル」を選ぶと「学費」は残る', async () => {
    const { requests } = openCategories()
    await deleteSchool('キャンセル')

    expect(writes(requests)).toHaveLength(0)
    expect(screen.getByText('学費')).toBeInTheDocument()
  })

  it('[MONEY-F-014/AC-5] 確認を開いている間に母が「学費」を削除していたら「このカテゴリーは見つかりません」と出る', async () => {
    openCategories({
      'DELETE /bill-categories/:id': errorResponse(
        404,
        'not_found',
        'このカテゴリーは見つかりません',
      ),
    })
    await deleteSchool('削除する')

    expect(await screen.findByRole('alert')).toHaveTextContent('このカテゴリーは見つかりません')
  })

  // AC ではない確認
  it('追加すると一覧を読み直して出す', async () => {
    let list = { categories: CATEGORIES.categories }
    installFakeApi({
      'GET /bill-categories': () => json(list),
      'POST /bill-categories': () => {
        list = WITH_SCHOOL
        return json(SCHOOL, 201)
      },
    })
    renderApp('/money/categories')
    await addCategory('学費')

    expect(await screen.findByText('学費')).toBeInTheDocument()
    expect(screen.getByLabelText('名前')).toHaveValue('')
  })

  it('削除できたら一覧から消える', async () => {
    let list = WITH_SCHOOL
    openCategories(
      {
        'GET /bill-categories': () => json(list),
        'DELETE /bill-categories/:id': () => {
          list = { categories: CATEGORIES.categories }
          return new Response(null, { status: 204 })
        },
      },
      WITH_SCHOOL,
    )
    await deleteSchool('削除する')

    await screen.findByText('医療費')
    await expect(screen.findByText('学費', {}, { timeout: 200 })).rejects.toThrow()
  })

  it('通信できずに追加できないと「通信できません。…」と出て、入力が残る', async () => {
    openCategories({
      'POST /bill-categories': () => {
        throw new TypeError('Failed to fetch')
      },
    })
    await addCategory('学費')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '通信できません。電波の良いところでもう一度お試しください。',
    )
    expect(screen.getByLabelText('名前')).toHaveValue('学費')
  })
})
