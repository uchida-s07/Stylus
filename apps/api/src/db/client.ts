import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// 本番は postgres.js（Hyperdrive 経由）、テストは PGlite。どちらもこの型で扱う
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export type DbSession = {
  db: Db
  close: () => Promise<void>
}

// Workers では接続を要求をまたいで使い回せないので、要求ごとに開いて閉じる（接続の使い回しは Hyperdrive が行う）
export function openHyperdriveDb(connectionString: string): DbSession {
  const client = postgres(connectionString, { max: 5, fetch_types: false })
  return { db: drizzle({ client, schema }), close: () => client.end() }
}
