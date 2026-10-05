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
