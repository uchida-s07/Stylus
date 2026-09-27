import type { Db } from './db/client'
import type { members } from './db/schema'

// Worker の env（wrangler.toml の vars とバインディング）
export type WorkerBindings = {
  CORS_ALLOWED_ORIGINS: string[]
  SUPABASE_URL: string
  HYPERDRIVE: Hyperdrive
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
