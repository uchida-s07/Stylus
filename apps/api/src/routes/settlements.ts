import { settlementQuerySchema } from '@stylus/shared'
import { Hono } from 'hono'
import type { AppHono } from '../env'
import { previewSettlement } from '../money/settlements'
import { queryInput } from '../validate'

// 精算（MONEY-F-009〜012）。/preview は /:id より先に登録する（:id は uuid の形でなければ 404）
export function settlementsRoute() {
  return new Hono<AppHono>().get('/preview', queryInput(settlementQuerySchema), async (c) => {
    const { as, counterpart } = c.req.valid('query')
    return c.json(await previewSettlement(c.var.db, c.var.member, as, counterpart))
  })
}
