import { z } from 'zod'

// GET /me の応答
export const meResponseSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  isAdmin: z.boolean(),
  isParent: z.boolean(),
  isCook: z.boolean(),
})

export type MeResponse = z.infer<typeof meResponseSchema>
