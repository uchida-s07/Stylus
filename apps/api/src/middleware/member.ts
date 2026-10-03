import { eq } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'
import { members } from '../db/schema'
import type { AppHono } from '../env'
import { apiError } from '../errors'

// トークンの sub で家族を探し、c.var.member に置く。登録されていなければ 403（COMMON-N-001）
export function memberMiddleware(): MiddlewareHandler<AppHono> {
  return async (c, next) => {
    const [member] = await c.var.db
      .select()
      .from(members)
      .where(eq(members.authUserId, c.var.authUserId))
      .limit(1)
    if (!member) {
      return c.json(apiError('not_a_member', '家族として登録されていません'), 403)
    }
    c.set('member', member)
    await next()
  }
}
