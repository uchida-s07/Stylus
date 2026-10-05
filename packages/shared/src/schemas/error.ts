import { z } from 'zod'

// API のエラーの形：{ error: { code, message } }
export const apiErrorCodeSchema = z.enum([
  'unauthenticated',
  'not_a_member',
  'forbidden',
  'internal',
  // お金（spec 002）で足したもの
  'invalid_input', // 400：入力が正しくない（fields に項目ごとの知らせ）
  'not_found', // 404：無い、または関係者でない
  'state_changed', // 409：画面を開いた後に状態や中身が変わった
  'in_use', // 409：請求で使われているカテゴリー
  'duplicate_name', // 409：同じ名前のカテゴリー
  'already_registered', // 409：二重登録を防ぐ ID が同じで中身が違う請求
])

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    // invalid_input のときの項目ごとの知らせ（項目名 → 知らせ）
    fields: z.record(z.string(), z.string()).optional(),
  }),
})

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>
export type ApiError = z.infer<typeof apiErrorSchema>
