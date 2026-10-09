import { CAR_MESSAGES, carInputSchema, type Car, type CarListResponse } from '@stylus/shared'
import { asc, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppConfig } from '../app'
import { carReservations, cars } from '../db/schema'
import type { AppHono } from '../env'
import { apiError } from '../errors'
import { jsonBody, PG, pgErrorCode } from '../validate'

const carColumns = { id: cars.id, name: cars.name, isActive: cars.isActive }

// 車（CAR-F-001〜003・009）。家族の誰でも見られ、登録・変更・削除できる
export function carsRoute(config: Pick<AppConfig, 'now'>) {
  return (
    new Hono<AppHono>()
      // 名前の順。予約があるか（「削除」を出すか）と、これからの予約の件数（「使わないにする」の確認）を添える
      .get('/', async (c) => {
        const now = config.now().toISOString()
        const rows = await c.var.db
          .select({
            ...carColumns,
            hasReservations: sql<boolean>`exists (select 1 from ${carReservations} where ${carReservations.carId} = ${cars.id})`,
            upcomingCount:
              sql<number>`(select count(*) from ${carReservations} where ${carReservations.carId} = ${cars.id} and ${carReservations.endsAt} > ${now}::timestamptz)`.mapWith(
                Number,
              ),
          })
          .from(cars)
          .orderBy(asc(cars.name))
        return c.json({ cars: rows } satisfies CarListResponse)
      })
      // 登録（CAR-F-001）。名前の重複（「使わない」の車を含む）は一意制約が止める
      .post('/', jsonBody(carInputSchema), async (c) => {
        const { name } = c.req.valid('json')
        try {
          const [row] = await c.var.db.insert(cars).values({ name }).returning(carColumns)
          // insert … returning は1行を返す
          return c.json(row as Car, 201)
        } catch (error) {
          if (pgErrorCode(error) === PG.UNIQUE_VIOLATION) {
            return c.json(apiError('duplicate_name', CAR_MESSAGES.duplicateName), 409)
          }
          throw error
        }
      })
  )
}
