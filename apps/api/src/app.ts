import { Hono } from 'hono'
import type { DbSession } from './db/client'
import type { AppHono, WorkerBindings } from './env'
import { authMiddleware, type TokenVerifier } from './middleware/auth'
import { corsMiddleware } from './middleware/cors'
import { dbMiddleware } from './middleware/db'
import { memberMiddleware } from './middleware/member'
import { meRoute } from './routes/me'

export type AppConfig = {
  corsAllowedOrigins: readonly string[]
  verifyToken: TokenVerifier
  openDb: (env: WorkerBindings) => DbSession
}

// ミドルウェアの順番：CORS → トークンの検証 → DB → 家族の照合 → 各ルート（design.md「API」）
// トークンが無効な要求では DB を開かない
export function createApp(config: AppConfig) {
  return new Hono<AppHono>()
    .use(corsMiddleware(config.corsAllowedOrigins))
    .use(authMiddleware(config.verifyToken))
    .use(dbMiddleware(config.openDb))
    .use(memberMiddleware())
    .route('/me', meRoute)
}

// フロントの Hono RPC（hc<AppType>）が import type で使う
export type AppType = ReturnType<typeof createApp>
