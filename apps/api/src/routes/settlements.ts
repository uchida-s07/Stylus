import { settlementInputSchema, settlementQuerySchema } from '@stylus/shared'
import { Hono } from 'hono'
import type { AppConfig } from '../app'
import type { AppHono } from '../env'
import { createSettlement, previewSettlement } from '../money/settlements'
import { jsonBody, queryInput } from '../validate'

// 精算（MONEY-F-009〜012）。/preview は /:id より先に登録する（:id は uuid の形でなければ 404）
export function settlementsRoute(config: Pick<AppConfig, 'now'>) {
  return (
    new Hono<AppHono>()
      .get('/preview', queryInput(settlementQuerySchema), async (c) => {
        const { as, counterpart } = c.req.valid('query')
        return c.json(await previewSettlement(c.var.db, c.var.member, as, counterpart))
      })
      // まとめて払った（MONEY-F-011）
      .post('/', jsonBody(settlementInputSchema), async (c) => {
        const settlement = await createSettlement(
          c.var.db,
          c.var.member,
          c.req.valid('json'),
          config.now(),
        )
        return c.json(settlement, 201)
      })
  )
}
