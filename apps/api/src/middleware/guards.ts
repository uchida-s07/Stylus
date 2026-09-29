import type { Context, MiddlewareHandler } from 'hono'
import type { AppHono, Member } from '../env'
import { apiError } from '../errors'

// 立場（COMMON-N-002）
export type Attribute = 'parent' | 'cook'

const ATTRIBUTE_COLUMN = {
  parent: 'isParent',
  cook: 'isCook',
} as const satisfies Record<Attribute, keyof Member>

// 家族の照合（memberMiddleware）の後ろで使う。足りなければ 403 forbidden
function requireMember(allowed: (member: Member) => boolean): MiddlewareHandler<AppHono> {
  return async (c: Context<AppHono>, next) => {
    if (!allowed(c.var.member)) {
      return c.json(apiError('forbidden', 'この操作をする権限がありません'), 403)
    }
    await next()
  }
}

// ロール「管理者」だけに許す
export function requireAdmin(): MiddlewareHandler<AppHono> {
  return requireMember((m) => m.isAdmin)
}

// 立場を持つ家族だけに許す
export function requireAttribute(attribute: Attribute): MiddlewareHandler<AppHono> {
  const column = ATTRIBUTE_COLUMN[attribute]
  return requireMember((m) => m[column])
}
