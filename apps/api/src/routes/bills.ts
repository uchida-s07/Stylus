import { billListQuerySchema, createBillInputSchema, toJstDate } from '@stylus/shared'
import { Hono } from 'hono'
import type { AppConfig } from '../app'
import type { AppHono } from '../env'
import { createBill } from '../money/bills'
import { listBills } from '../money/list'
import { jsonBody, queryInput } from '../validate'

// 請求（MONEY-F-001〜009）。関係者・側・状態の判定は money/ で行う
export function billsRoute(config: Pick<AppConfig, 'now'>) {
  return new Hono<AppHono>()
    .get('/', queryInput(billListQuerySchema), async (c) => {
      const { view } = c.req.valid('query')
      return c.json(await listBills(c.var.db, c.var.member, view))
    })
    .post(
      '/',
      jsonBody(() => createBillInputSchema(toJstDate(config.now()))),
      async (c) => {
        const bill = await createBill(c.var.db, c.var.member, c.req.valid('json'))
        return c.json(bill, 201)
      },
    )
}
