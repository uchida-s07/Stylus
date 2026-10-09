import { Hono } from 'hono'
import type { DbSession } from './db/client'
import type { AppHono, WorkerBindings } from './env'
import { authMiddleware, type TokenVerifier } from './middleware/auth'
import { corsMiddleware } from './middleware/cors'
import { errorHandler } from './middleware/error'
import { dbMiddleware } from './middleware/db'
import { memberMiddleware } from './middleware/member'
import { billCategoriesRoute } from './routes/bill-categories'
import { billsRoute } from './routes/bills'
import { carReservationsRoute } from './routes/car-reservations'
import { carsRoute } from './routes/cars'
import { membersRoute } from './routes/members'
import { settlementsRoute } from './routes/settlements'
import { meRoute } from './routes/me'

export type AppConfig = {
  corsAllowedOrigins: readonly string[]
  verifyToken: TokenVerifier
  openDb: (env: WorkerBindings) => DbSession
  // 予期しないエラーを知らせる（本番は Sentry）
  reportError: (error: unknown) => void
  // 今の日時（発生日の上限・経過の日時・予約の状態。テストで差し替える）
  now: () => Date
}

// ミドルウェアの順番：CORS → エラー処理 → トークンの検証 → DB → 家族の照合 → 各ルート（design.md「API」）
// エラー処理は onError で受ける（CORS のヘッダーは 500 の応答にも付く）
// トークンが無効な要求では DB を開かない
export function createApp(config: AppConfig) {
  const app = new Hono<AppHono>()
  app.onError(errorHandler(config.reportError))
  return app
    .use(corsMiddleware(config.corsAllowedOrigins))
    .use(authMiddleware(config.verifyToken))
    .use(dbMiddleware(config.openDb))
    .use(memberMiddleware())
    .route('/me', meRoute)
    .route('/members', membersRoute)
    .route('/bills', billsRoute(config))
    .route('/settlements', settlementsRoute(config))
    .route('/bill-categories', billCategoriesRoute)
    .route('/cars', carsRoute(config))
    .route('/car-reservations', carReservationsRoute(config))
}

// フロントの Hono RPC（hc<AppType>）が import type で使う
export type AppType = ReturnType<typeof createApp>
