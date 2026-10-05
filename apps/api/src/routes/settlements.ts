import { settlementInputSchema, settlementQuerySchema } from '@stylus/shared'
import { Hono } from 'hono'
import type { AppConfig } from '../app'
import type { AppHono } from '../env'
import {
  createSettlement,
  loadSettlementDetail,
  operateSettlement,
  previewSettlement,
  SETTLEMENT_NOT_FOUND,
} from '../money/settlements'
import { idParam, jsonBody, queryInput } from '../validate'

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
      // 精算の中身（MONEY-F-012）
      .get('/:id', idParam(SETTLEMENT_NOT_FOUND), async (c) => {
        const { id } = c.req.valid('param')
        return c.json(await loadSettlementDetail(c.var.db, c.var.member, id))
      })
      // まとめて受け取った（MONEY-F-012）
      .post('/:id/confirm', idParam(SETTLEMENT_NOT_FOUND), async (c) => {
        const { id } = c.req.valid('param')
        const now = config.now()
        return c.json(await operateSettlement(c.var.db, c.var.member, id, 'confirm', now))
      })
      // 精算ごと戻す（MONEY-F-009）。払う側なら「払ったを取り消した」、受け取る側なら「受け取っていない」
      .post('/:id/revert', idParam(SETTLEMENT_NOT_FOUND), async (c) => {
        const { id } = c.req.valid('param')
        const now = config.now()
        return c.json(await operateSettlement(c.var.db, c.var.member, id, 'revert', now))
      })
  )
}
