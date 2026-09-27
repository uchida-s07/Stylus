import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { join } from 'node:path'
import * as schema from '../src/db/schema'

const migrationsFolder = join(import.meta.dirname, '..', 'drizzle')

// テスト用の DB：メモリ上の PGlite に、本番と同じ Drizzle のマイグレーションを当てる
// テストごとに作り、終わったら close する（テストどうしでデータを共有しない）
export async function createTestDb() {
  const client = new PGlite()
  const db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder })
  return { db, client, close: () => client.close() }
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>
