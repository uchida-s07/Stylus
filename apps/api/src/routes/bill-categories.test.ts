import { apiErrorSchema, categoryListResponseSchema, categorySchema } from '@stylus/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMoneyTestApp, type MoneyTestApp } from '../../test/money'

describe('カテゴリーの API（MONEY-F-013・014）', () => {
  let t: MoneyTestApp

  beforeEach(async () => {
    t = await createMoneyTestApp()
  })

  afterEach(async () => {
    await t.close()
  })

  async function names(who: 'seigo' | 'mother' = 'seigo') {
    const res = await t.call(who, 'GET', '/bill-categories')
    expect(res.status).toBe(200)
    return categoryListResponseSchema.parse(await res.json()).categories.map((c) => c.name)
  }

  async function expectError(res: Response, status: number, code: string) {
    expect(res.status).toBe(status)
    const body = apiErrorSchema.parse(await res.json())
    expect(body.error.code).toBe(code)
    return body.error
  }

  const add = (name: string) => t.call('seigo', 'POST', '/bill-categories', { name })

  it('[MONEY-F-013/AC-1] せいごが「学費」を追加すると、母のカテゴリーの選択肢に「学費」が出る', async () => {
    const res = await add('学費')
    expect(res.status).toBe(201)
    expect(categorySchema.parse(await res.json()).name).toBe('学費')
    expect(await names('mother')).toContain('学費')
  })

  it('[MONEY-F-013/AC-2] 使い始めたばかりなら、選択肢は 医療費・食費・交通費・日用品・その他 の5つ', async () => {
    expect(await names()).toEqual(['医療費', '食費', '交通費', '日用品', 'その他'])
  })

  it('[MONEY-F-013/AC-3] 名前が空白だけなら追加されず「入力してください」', async () => {
    const error = await expectError(await add('　 '), 400, 'invalid_input')
    expect(error.fields?.name).toBe('入力してください')
    expect(await names()).toHaveLength(5)
  })

  it('[MONEY-F-013/AC-4] 「医療費」があるときに「　医療費　」を追加すると、追加されず「同じ名前のカテゴリーがあります」', async () => {
    const error = await expectError(await add('　医療費　'), 409, 'duplicate_name')
    expect(error.message).toBe('同じ名前のカテゴリーがあります')
    expect(await names()).toHaveLength(5)
  })

  it('[MONEY-F-013/AC-5] 21文字の名前は追加されない（20文字なら追加される）', async () => {
    await expectError(await add('あ'.repeat(21)), 400, 'invalid_input')
    expect(await names()).toHaveLength(5)
    expect((await add('あ'.repeat(20))).status).toBe(201)
  })

  it('[MONEY-F-014/AC-1] 使われていない「学費」を削除すると、一覧と選択肢から消える', async () => {
    await add('学費')
    const id = await t.categoryId('学費')
    const res = await t.call('seigo', 'DELETE', `/bill-categories/${id}`)
    expect(res.status).toBe(204)
    expect(await names('mother')).not.toContain('学費')
  })

  it('[MONEY-F-014/AC-2] 取消の請求1件だけに使われている「食費」は削除されず「…使われているため削除できません」', async () => {
    const id = await t.categoryId('食費')
    await t.insertBill({ categoryId: id, status: 'canceled' })
    const error = await expectError(
      await t.call('seigo', 'DELETE', `/bill-categories/${id}`),
      409,
      'in_use',
    )
    expect(error.message).toBe('このカテゴリーは請求で使われているため削除できません')
    expect(await names()).toContain('食費')
  })

  it('[MONEY-F-014/AC-4] 削除の確認を開いている間に母が「学費」で請求を登録したら、削除されず「…使われているため削除できません」', async () => {
    await add('学費')
    const id = await t.categoryId('学費')
    // 確認を開いた後（削除の要求の前）に、母が登録した
    await t.insertBill({
      fromMemberId: t.family.mother.id,
      toMemberId: t.family.seigo.id,
      categoryId: id,
    })
    await expectError(await t.call('seigo', 'DELETE', `/bill-categories/${id}`), 409, 'in_use')
    expect(await names()).toContain('学費')
  })

  it('[MONEY-F-014/AC-5] 削除の確認を開いている間に母が「学費」を削除していたら「このカテゴリーは見つかりません」', async () => {
    await add('学費')
    const id = await t.categoryId('学費')
    expect((await t.call('mother', 'DELETE', `/bill-categories/${id}`)).status).toBe(204)
    const error = await expectError(
      await t.call('seigo', 'DELETE', `/bill-categories/${id}`),
      404,
      'not_found',
    )
    expect(error.message).toBe('このカテゴリーは見つかりません')
  })

  // AC ではない確認
  it('ID が uuid の形でなければ 404 not_found', async () => {
    await expectError(await t.call('seigo', 'DELETE', '/bill-categories/abc'), 404, 'not_found')
  })

  it('追加した名前は前後の空白を除いて保存し、追加の順に並ぶ', async () => {
    await add(' 学費 ')
    await add('車')
    expect(await names()).toEqual(['医療費', '食費', '交通費', '日用品', 'その他', '学費', '車'])
  })
})
