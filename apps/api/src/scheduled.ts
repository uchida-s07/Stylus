import { sql } from 'drizzle-orm'
import type { DbSession } from './db/client'

// Supabase を休止させないための問い合わせ（COMMON-N-006）
// DB への問い合わせが「利用者による DB の活動」に数えられる（design.md の V-2）。Hyperdrive のキャッシュは無効にしてあるので DB まで届く
// 失敗したら例外をそのまま投げる（withSentry が Sentry に送る。翌日の実行で取り返せるので再試行はしない）
export async function keepAlive(open: () => DbSession): Promise<void> {
  const session = open()
  try {
    await session.db.execute(sql`select 1`)
  } finally {
    await session.close()
  }
}
