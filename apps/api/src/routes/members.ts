import type { MemberListResponse } from '@stylus/shared'
import { asc } from 'drizzle-orm'
import { Hono } from 'hono'
import { members } from '../db/schema'
import type { AppHono } from '../env'

// 家族の一覧（請求先・精算の相手を選ぶため）。メールアドレスなどは返さない
export const membersRoute = new Hono<AppHono>().get('/', async (c) => {
  const rows = await c.var.db
    .select({ id: members.id, displayName: members.displayName, isParent: members.isParent })
    .from(members)
    .orderBy(asc(members.createdAt), asc(members.id))
  return c.json({ members: rows } satisfies MemberListResponse)
})
