import type { MeResponse } from '@stylus/shared'
import { Hono } from 'hono'
import type { AppHono } from '../env'

// 自分の情報（AUTH-F-001、AUTH-F-002 のホームの表示名）
export const meRoute = new Hono<AppHono>().get('/', (c) => {
  const { id, displayName, isAdmin, isParent, isCook } = c.var.member
  return c.json({ id, displayName, isAdmin, isParent, isCook } satisfies MeResponse)
})
