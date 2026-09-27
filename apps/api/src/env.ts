import type { Db } from './db/client'
import type { members } from './db/schema'

// Worker の env（wrangler.toml の vars とバインディング）
export type WorkerBindings = {
  CORS_ALLOWED_ORIGINS: string[]
  SUPABASE_URL: string
  HYPERDRIVE: Hyperdrive
  // Sentry（COMMON-N-011）。DSN が無ければ送らない
  SENTRY_DSN?: string
  SENTRY_ENVIRONMENT: string
}

export type Member = typeof members.$inferSelect

// Hono のアプリの型引数
export type AppHono = {
  Bindings: WorkerBindings
  Variables: {
    db: Db
    // トークンの sub（Supabase Auth の利用者 ID）
    authUserId: string
    member: Member
  }
}
