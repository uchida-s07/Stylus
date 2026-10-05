import {
  billActionInputSchema,
  billListQuerySchema,
  billReturnInputSchema,
  createBillEditSchema,
  createBillInputSchema,
  toJstDate,
} from '@stylus/shared'
import { Hono } from 'hono'
import type { AppConfig } from '../app'
import type { AppHono } from '../env'
import { createBill, editBill } from '../money/bills'
import { listBills } from '../money/list'
import { BILL_NOT_FOUND, loadBillDetail } from '../money/load'
import { operateBill } from '../money/operate'
import { idParam, jsonBody, queryInput } from '../validate'

// 請求（MONEY-F-001〜009）。関係者・側・状態の判定は money/ で行う
export function billsRoute(config: Pick<AppConfig, 'now'>) {
  const today = () => toJstDate(config.now())

  return (
    new Hono<AppHono>()
      .get('/', queryInput(billListQuerySchema), async (c) => {
        const { view } = c.req.valid('query')
        return c.json(await listBills(c.var.db, c.var.member, view))
      })
      .post(
        '/',
        jsonBody(() => createBillInputSchema(today())),
        async (c) => {
          const bill = await createBill(c.var.db, c.var.member, c.req.valid('json'), config.now())
          return c.json(bill, 201)
        },
      )
      .get('/:id', idParam(BILL_NOT_FOUND), async (c) => {
        const { id } = c.req.valid('param')
        return c.json(await loadBillDetail(c.var.db, c.var.member, id))
      })
      // 直す・出し直す（MONEY-F-002）
      .patch(
        '/:id',
        idParam(BILL_NOT_FOUND),
        jsonBody(() => createBillEditSchema(today())),
        async (c) => {
          const { id } = c.req.valid('param')
          const bill = await editBill(c.var.db, c.var.member, id, c.req.valid('json'), config.now())
          return c.json(bill)
        },
      )
      // 払った（MONEY-F-006）
      .post('/:id/pay', idParam(BILL_NOT_FOUND), jsonBody(billActionInputSchema), async (c) => {
        const { id } = c.req.valid('param')
        const { version } = c.req.valid('json')
        const now = config.now()
        return c.json(await operateBill(c.var.db, c.var.member, id, 'pay', { version, now }))
      })
      // 差し戻す（MONEY-F-008）
      .post('/:id/return', idParam(BILL_NOT_FOUND), jsonBody(billReturnInputSchema), async (c) => {
        const { id } = c.req.valid('param')
        const { version, reason } = c.req.valid('json')
        const now = config.now()
        return c.json(
          await operateBill(c.var.db, c.var.member, id, 'return', { version, now, reason }),
        )
      })
      // 取り消す（MONEY-F-003）
      .post('/:id/cancel', idParam(BILL_NOT_FOUND), jsonBody(billActionInputSchema), async (c) => {
        const { id } = c.req.valid('param')
        const { version } = c.req.valid('json')
        const now = config.now()
        return c.json(await operateBill(c.var.db, c.var.member, id, 'cancel', { version, now }))
      })
  )
}
