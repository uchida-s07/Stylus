// 請求のフォーム（BillForm）の値と、API の入力への変換
export type BillFormValues = {
  as: 'self' | 'household'
  to: string
  amount: string
  categoryId: string
  title: string
  memo: string
  occurredOn: string
}

export type FieldErrors = Partial<Record<keyof BillFormValues, string>>

// 送った結果：成功、項目ごとの知らせ、フォームの上に出す知らせ
export type SendResult =
  | { kind: 'ok' }
  | { kind: 'fieldErrors'; errors: Record<string, string> }
  | { kind: 'notice'; message: string }

// フォームの値を API の入力の形にする（空は「無い」として送り、スキーマで「入力してください」にする）
export function formToInput(values: BillFormValues) {
  const amount = values.amount.trim()
  return {
    amount: amount === '' ? undefined : Number(amount),
    categoryId: values.categoryId || undefined,
    title: values.title,
    memo: values.memo,
    occurredOn: values.occurredOn || undefined,
  }
}

// 金額が半角の数字（とマイナス・小数点）だけで書かれているか（MONEY-F-001/AC-19）
// 全角の数字などは半角に直さず、止めて理由を出す（2026-10-05 オーナー決定）
const HALF_WIDTH_NUMBER = /^-?[0-9]+(\.[0-9]+)?$/
export const AMOUNT_NOT_HALF_WIDTH = '半角の数字で入力してください'

// 画面での入力の検証：スキーマの結果に、金額の書き方の確認を重ねる。知らせが無ければ undefined
export function formErrors(
  parsed: { success: true } | { success: false; error: Parameters<typeof fieldErrorsOf>[0] },
  values: BillFormValues,
): Record<string, string> | undefined {
  const errors = parsed.success ? {} : fieldErrorsOf(parsed.error)
  const amount = values.amount.trim()
  if (amount !== '' && !HALF_WIDTH_NUMBER.test(amount)) errors.amount = AMOUNT_NOT_HALF_WIDTH
  return Object.keys(errors).length > 0 ? errors : undefined
}

// スキーマの失敗を項目ごとの知らせにする（項目ごとに最初の1つ）
export function fieldErrorsOf(error: {
  issues: { path: PropertyKey[]; message: string }[]
}): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_')
    errors[key] ??= issue.message
  }
  return errors
}
