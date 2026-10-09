import {
  CAR_MESSAGES,
  carInputSchema,
  carPatchSchema,
  type Car,
  type CarListResponse,
} from '@stylus/shared'
import { asc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppConfig } from '../app'
import { carReservations, cars } from '../db/schema'
import type { AppHono } from '../env'
import { apiError } from '../errors'
import { idParam, jsonBody, PG, pgErrorCode } from '../validate'

const carColumns = { id: cars.id, name: cars.name, isActive: cars.isActive }

// サブクエリから外側の cars の行を指す。1つの表だけの select では、Drizzle は列を表の名前なしで出すので、
// ${cars.id} と書くとサブクエリの中では car_reservations.id を指してしまう
const outerCarId = sql`${sql.identifier('cars')}.${sql.identifier('id')}`

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
            hasReservations: sql<boolean>`exists (select 1 from ${carReservations} where ${carReservations.carId} = ${outerCarId})`,
            upcomingCount:
              sql<number>`(select count(*) from ${carReservations} where ${carReservations.carId} = ${outerCarId} and ${carReservations.endsAt} > ${now}::timestamptz)`.mapWith(
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
      // 名前を変える（CAR-F-009）、使う／使わないを切り替える（CAR-F-002）。送られた項目だけを変える
      // 版は持たない（結果の値を送るだけなので、同じ値にする操作はそのまま成功。design.md「車」）
      .patch('/:id', idParam(CAR_MESSAGES.carNotFound), jsonBody(carPatchSchema), async (c) => {
        const { id } = c.req.valid('param')
        const input = c.req.valid('json')
        const changes =
          input.name !== undefined ? { name: input.name } : { isActive: input.isActive }
        try {
          const [row] = await c.var.db
            .update(cars)
            .set(changes)
            .where(eq(cars.id, id))
            .returning(carColumns)
          if (!row) return c.json(apiError('not_found', CAR_MESSAGES.carNotFound), 404)
          return c.json(row satisfies Car)
        } catch (error) {
          if (pgErrorCode(error) === PG.UNIQUE_VIOLATION) {
            return c.json(apiError('duplicate_name', CAR_MESSAGES.duplicateName), 409)
          }
          throw error
        }
      })
      // 削除（CAR-F-003）。予約が1件でもあれば外部キー（RESTRICT）が止める。確認を開いた後に入った予約も同じ
      // 取り消した予約は行が消えているので数えない
      .delete('/:id', idParam(CAR_MESSAGES.carNotFound), async (c) => {
        const { id } = c.req.valid('param')
        try {
          const deleted = await c.var.db
            .delete(cars)
            .where(eq(cars.id, id))
            .returning({ id: cars.id })
          if (deleted.length === 0) {
            return c.json(apiError('not_found', CAR_MESSAGES.carNotFound), 404)
          }
          return c.body(null, 204)
        } catch (error) {
          const code = pgErrorCode(error)
          if (code === PG.RESTRICT_VIOLATION || code === PG.FOREIGN_KEY_VIOLATION) {
            return c.json(apiError('in_use', CAR_MESSAGES.carInUse), 409)
          }
          throw error
        }
      })
  )
}
