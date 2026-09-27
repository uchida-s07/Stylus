import { Hono } from 'hono'
import type { DbSession } from './db/client'
import type { AppHono, WorkerBindings } from './env'
import { authMiddleware, type TokenVerifier } from './middleware/auth'
import { corsMiddleware } from './middleware/cors'
import { errorHandler } from './middleware/error'
import { dbMiddleware } from './middleware/db'
import { memberMiddleware } from './middleware/member'
import { meRoute } from './routes/me'

export type AppConfig = {
  corsAllowedOrigins: readonly string[]
  verifyToken: TokenVerifier
  openDb: (env: WorkerBindings) => DbSession
  // 予期しないエラーを知らせる（本番は Sentry）
  reportError: (error: unknown) => void
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
}

// フロントの Hono RPC（hc<AppType>）が import type で使う
export type AppType = ReturnType<typeof createApp>
