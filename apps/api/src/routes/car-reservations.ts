import {
  createReservationInputSchema,
  reservationListQuerySchema,
  type ReservationListResponse,
} from '@stylus/shared'
import { Hono } from 'hono'
import type { AppConfig } from '../app'
import { listUpcoming } from '../car/list'
import { createReservation } from '../car/reservations'
import type { AppHono } from '../env'
import { jsonBody, queryInput } from '../validate'

// 予約（CAR-F-004〜008）。本人と状態の判定・重なりの知らせは car/ で行う
// 「今」は API の時計（AppConfig.now）で決める
export function carReservationsRoute(config: Pick<AppConfig, 'now'>) {
  return (
    new Hono<AppHono>()
      // 予定（CAR-F-005）
      .get('/', queryInput(reservationListQuerySchema), async (c) => {
        const reservations = await listUpcoming(c.var.db, config.now())
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
  )
}
