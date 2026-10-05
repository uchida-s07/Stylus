import { billListQuerySchema, createBillInputSchema, toJstDate } from '@stylus/shared'
import { Hono } from 'hono'
import type { AppConfig } from '../app'
import type { AppHono } from '../env'
import { createBill } from '../money/bills'
import { listBills } from '../money/list'
import { BILL_NOT_FOUND, loadBillDetail, loadRelatedBill } from '../money/load'
import { idParam, jsonBody, queryInput } from '../validate'

// 請求（MONEY-F-001〜009）。関係者・側・状態の判定は money/ で行う
export function billsRoute(config: Pick<AppConfig, 'now'>) {
  return (
    new Hono<AppHono>()
      .get('/', queryInput(billListQuerySchema), async (c) => {
        const { view } = c.req.valid('query')
        return c.json(await listBills(c.var.db, c.var.member, view))
      })
      .post(
        '/',
        jsonBody(() => createBillInputSchema(toJstDate(config.now()))),
        async (c) => {
          const bill = await createBill(c.var.db, c.var.member, c.req.valid('json'), config.now())
          return c.json(bill, 201)
        },
      )
      .get('/:id', idParam(BILL_NOT_FOUND), async (c) => {
        const { id } = c.req.valid('param')
        return c.json(await loadBillDetail(c.var.db, c.var.member, id))
      })
      // 操作は、関係者でなければ 404 まで（中身は後のタスクで足す）
      .patch('/:id', idParam(BILL_NOT_FOUND), async (c) => {
        await loadRelatedBill(c.var.db, c.var.member, c.req.valid('param').id)
        return c.json({}, 200)
      })
      .post('/:id/pay', idParam(BILL_NOT_FOUND), async (c) => {
        await loadRelatedBill(c.var.db, c.var.member, c.req.valid('param').id)
        return c.json({}, 200)
      })
      .post('/:id/return', idParam(BILL_NOT_FOUND), async (c) => {
        await loadRelatedBill(c.var.db, c.var.member, c.req.valid('param').id)
        return c.json({}, 200)
      })
      .post('/:id/cancel', idParam(BILL_NOT_FOUND), async (c) => {
        await loadRelatedBill(c.var.db, c.var.member, c.req.valid('param').id)
        return c.json({}, 200)
      })
  )
}
