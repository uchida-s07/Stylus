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
  'in_use', // 409：請求で使われているカテゴリー・予約のある車
  'duplicate_name', // 409：同じ名前のカテゴリー・車
  'already_registered', // 409：二重登録を防ぐ ID が同じで中身が違う請求・予約
  // 車（spec 003）で足したもの
  'overlap', // 409：同じ車で時間が重なる予約がある（conflict に重なった予約）
  'car_unavailable', // 409：選んだ車（移す先の車）が「使わない」
])

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    // invalid_input のときの項目ごとの知らせ（項目名 → 知らせ）
    fields: z.record(z.string(), z.string()).optional(),
    // overlap のときの重なった予約（画面が日本時間で表示して知らせを作る）
    conflict: z
      .object({
        displayName: z.string(),
        startsAt: z.iso.datetime({ offset: true }),
        endsAt: z.iso.datetime({ offset: true }),
      })
      .optional(),
  }),
})

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>
export type ApiError = z.infer<typeof apiErrorSchema>
