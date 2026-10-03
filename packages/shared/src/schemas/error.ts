import { z } from 'zod'

// API のエラーの形：{ error: { code, message } }
export const apiErrorCodeSchema = z.enum([
  'unauthenticated',
  'not_a_member',
  'forbidden',
  'internal',
])

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
  }),
})

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>
export type ApiError = z.infer<typeof apiErrorSchema>
