import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { join } from 'node:path'
import * as schema from '../src/db/schema'

const migrationsFolder = join(import.meta.dirname, '..', 'drizzle')

// テスト用の DB：メモリ上の PGlite に、本番と同じ Drizzle のマイグレーションを当てる
// テストごとに作り、終わったら close する（テストどうしでデータを共有しない）
// onQuery を渡すと、マイグレーションの後に送られた問い合わせを受け取れる
export async function createTestDb(options: { onQuery?: (query: string) => void } = {}) {
  // 予約の排他制約に btree_gist を使う（spec 003 design.md V-1）
  const client = new PGlite({ extensions: { btree_gist } })
  let migrated = false
  const db = drizzle({
    client,
    schema,
    logger: {
      logQuery: (query) => {
        if (migrated) options.onQuery?.(query)
      },
    },
  })
  await migrate(db, { migrationsFolder })
  migrated = true
  return { db, client, close: () => client.close() }
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>
