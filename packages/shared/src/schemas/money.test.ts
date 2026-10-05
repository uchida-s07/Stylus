import { describe, expect, it } from 'vitest'
import {
  billReturnInputSchema,
  categoryInputSchema,
  charCount,
  createBillInputSchema,
  MONEY_MESSAGES,
  trimBlank,
} from './money'

// 入力の検証の細部（tasks.md D-1。AC は API・画面のテストで確かめる）
const TODAY = '2026-10-04'
const schema = createBillInputSchema(TODAY)
const valid = {
  to: '00000000-0000-4000-8000-000000000001',
  amount: 3000,
  categoryId: '00000000-0000-4000-8000-000000000002',
  title: '歯医者',
  occurredOn: TODAY,
  requestId: '00000000-0000-4000-8000-000000000003',
}

function issuesOf(input: unknown) {
  const result = schema.safeParse(input)
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((i) => [String(i.path[0]), i.message]))
}

describe('空白と文字数', () => {
  it('前後の半角空白・タブ・改行・全角空白を除き、間の空白は残す', () => {
    expect(trimBlank(' \t\r\n　歯 医者　\n')).toBe('歯 医者')
  })

  it('文字数はコードポイントで数える（絵文字1つも1文字）', () => {
    expect(charCount('😀あa')).toBe(3)
  })

  it('件名・メモは前後の空白を除いた値になる。メモは空白だけなら null', () => {
    const parsed = schema.parse({ ...valid, title: '　歯医者 ', memo: ' \n ' })
    expect(parsed.title).toBe('歯医者')
    expect(parsed.memo).toBeNull()
    expect(schema.parse({ ...valid, memo: ' 保険証 ' }).memo).toBe('保険証')
    expect(schema.parse(valid).memo).toBeNull()
  })

  it('件名：空白だけは「入力してください」、絵文字50個は通り、51文字は止まる', () => {
    expect(issuesOf({ ...valid, title: '　 ' })).toEqual({ title: MONEY_MESSAGES.required })
    expect(issuesOf({ ...valid, title: '😀'.repeat(50) })).toEqual({})
    expect(issuesOf({ ...valid, title: 'あ'.repeat(51) })).toEqual({
      title: MONEY_MESSAGES.maxLength(50),
    })
  })

  it('メモ：500文字は通り、501文字は止まる（前後の空白は数えない）', () => {
    expect(issuesOf({ ...valid, memo: ` ${'あ'.repeat(500)} ` })).toEqual({})
    expect(issuesOf({ ...valid, memo: 'あ'.repeat(501) })).toEqual({
      memo: MONEY_MESSAGES.maxLength(500),
    })
  })
})

describe('請求の入力', () => {
  it('名義の既定は「自分」', () => {
    expect(schema.parse(valid).as).toBe('self')
  })

  it.each([0, -100, 1.5, 10_000_000])('金額 %d は止まる', (amount) => {
    expect(issuesOf({ ...valid, amount })).toEqual({ amount: MONEY_MESSAGES.amount })
  })

  it('空の項目は「入力してください」', () => {
    expect(issuesOf({ requestId: valid.requestId, title: '' })).toEqual({
      to: MONEY_MESSAGES.required,
      amount: MONEY_MESSAGES.required,
      categoryId: MONEY_MESSAGES.required,
      title: MONEY_MESSAGES.required,
      occurredOn: MONEY_MESSAGES.required,
    })
  })

  it('発生日：今日と 2020-01-01 は通り、明日と 2019-12-31 は止まる', () => {
    expect(issuesOf({ ...valid, occurredOn: '2020-01-01' })).toEqual({})
    expect(issuesOf({ ...valid, occurredOn: '2026-10-05' })).toEqual({
      occurredOn: MONEY_MESSAGES.futureDate,
    })
    expect(issuesOf({ ...valid, occurredOn: '2019-12-31' })).toEqual({
      occurredOn: MONEY_MESSAGES.tooOldDate,
    })
  })
})

describe('差し戻しの理由・カテゴリー名', () => {
  it('理由：空白だけは「理由を入力してください」、200文字は通り、201文字は止まる', () => {
    const r = (reason: string) => billReturnInputSchema.safeParse({ version: 1, reason })
    expect(r('　').error?.issues[0]?.message).toBe(MONEY_MESSAGES.reasonRequired)
    expect(r('あ'.repeat(200)).success).toBe(true)
    expect(r('あ'.repeat(201)).success).toBe(false)
  })

  it('カテゴリー名：前後の空白を除き、20文字まで', () => {
    expect(categoryInputSchema.parse({ name: '　学費　' }).name).toBe('学費')
    expect(categoryInputSchema.safeParse({ name: 'あ'.repeat(21) }).success).toBe(false)
    expect(categoryInputSchema.safeParse({ name: ' ' }).success).toBe(false)
  })
})
