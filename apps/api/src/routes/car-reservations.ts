import {
  CAR_MESSAGES,
  createReservationEditSchema,
  createReservationInputSchema,
  reservationListQuerySchema,
  type ReservationListResponse,
} from '@stylus/shared'
import { Hono } from 'hono'
import type { AppConfig } from '../app'
import { listPast, listUpcoming, loadReservationDetail } from '../car/list'
import { createReservation } from '../car/reservations'
import { updateReservation } from '../car/update'
import type { AppHono } from '../env'
import { idParam, jsonBody, queryInput } from '../validate'

// 予約（CAR-F-004〜008）。本人と状態の判定・重なりの知らせは car/ で行う
// 「今」は API の時計（AppConfig.now）で決める
export function carReservationsRoute(config: Pick<AppConfig, 'now'>) {
  return (
    new Hono<AppHono>()
      // 予定（CAR-F-005）と履歴（CAR-F-008）
      .get('/', queryInput(reservationListQuerySchema), async (c) => {
        const { view, before } = c.req.valid('query')
        const now = config.now()
        if (view === 'past') return c.json(await listPast(c.var.db, now, before))
        const reservations = await listUpcoming(c.var.db, now)
        return c.json({ reservations, nextCursor: null } satisfies ReservationListResponse)
      })
      // 予約を入れる（CAR-F-004）
      .post(
        '/',
        jsonBody(() => createReservationInputSchema(config.now())),
        async (c) => {
          const reservation = await createReservation(c.var.db, c.var.member, c.req.valid('json'))
          return c.json(reservation, 201)
        },
      )
      // 予約の中身（CAR-F-005〜008）
      .get('/:id', idParam(CAR_MESSAGES.reservationNotFound), async (c) => {
        const { id } = c.req.valid('param')
        return c.json(await loadReservationDetail(c.var.db, c.var.member, id))
      })
      // 予約を直す（CAR-F-006）。送る項目の形で、まだ始まっていない予約の直し方か使用中の予約の直し方かが決まる
      .patch(
        '/:id',
        idParam(CAR_MESSAGES.reservationNotFound),
        jsonBody(() => createReservationEditSchema(config.now())),
        async (c) => {
          const { id } = c.req.valid('param')
          return c.json(
            await updateReservation(c.var.db, c.var.member, id, c.req.valid('json'), config.now()),
          )
        },
      )
  )
}
