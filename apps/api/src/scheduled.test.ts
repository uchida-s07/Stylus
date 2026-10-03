import { createTransport, type CloudflareOptions } from '@sentry/cloudflare'
import { join } from 'node:path'
import { unstable_readConfig } from 'wrangler'
import { afterEach, describe, expect, it } from 'vitest'
import { testAppConfig } from '../test/app'
import { createTestDb, type TestDb } from '../test/db'
import type { Db, DbSession } from './db/client'
import type { WorkerBindings } from './env'
import { createWorker } from './index'
import { sentryOptions } from './sentry'

const env = {
  CORS_ALLOWED_ORIGINS: [],
  SUPABASE_URL: 'https://test-project.supabase.co',
  SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0',
  SENTRY_ENVIRONMENT: 'test',
} as unknown as WorkerBindings

// Sentry へ送る直前の中身（envelope）を受け止め、event の数を数える
const sent: string[] = []
function captureTransport(): CloudflareOptions['transport'] {
  return (options) =>
    createTransport(options, async (request) => {
      sent.push(
        typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body),
      )
      return { statusCode: 200 }
    })
}
function sentEvents() {
  return sent.flatMap((envelope) =>
    envelope
      .split('\n')
      .filter(Boolean)
      .filter((line) => JSON.parse(line).type === 'event'),
  )
}

// テストごとに DB の開き方を差し替える（Sentry の client はプロセスに1つなので Worker は使い回す）
let openDb: () => DbSession
const worker: ExportedHandler<WorkerBindings> = createWorker(
  () => testAppConfig({ openDb: () => openDb() }),
  (e) => sentryOptions(e, { transport: captureTransport() }),
)

// Cron の処理を1回走らせる。例外は投げずに返す
async function runCron() {
  sent.length = 0
  const pending: Promise<unknown>[] = []
  const ctx = {
    waitUntil: (p: Promise<unknown>) => pending.push(p),
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext
  const controller = { cron: '0 19 * * *', scheduledTime: Date.now(), noRetry: () => {} }
  let error: unknown
  try {
    await worker.scheduled!(controller as ScheduledController, env, ctx)
  } catch (e) {
    error = e
  }
  await Promise.all(pending)
  return { error }
}

describe('Supabase を休止させない Cron（COMMON-N-006）', () => {
  let testDb: TestDb | undefined

  afterEach(async () => {
    await testDb?.close()
    testDb = undefined
  })

  it('[COMMON-N-006/AC-1] Cron の処理を実行すると、Supabase への問い合わせが1回送られ、成功の応答を受け取る', async () => {
    const queries: string[] = []
    testDb = await createTestDb({ onQuery: (q) => queries.push(q) })
    let closed = 0
    openDb = () => ({ db: testDb!.db, close: async () => void closed++ })

    const { error } = await runCron()

    expect(queries).toHaveLength(1)
    expect(error).toBeUndefined()
    expect(sentEvents()).toHaveLength(0)
    expect(closed).toBe(1)
  })

  it('[COMMON-N-006/AC-2] Supabase への問い合わせが失敗すると、エラーが Sentry に1回送られる', async () => {
    let closed = 0
    const failingDb = {
      execute: async () => {
        throw new Error('Supabase につながらない')
      },
    } as unknown as Db
    openDb = () => ({ db: failingDb, close: async () => void closed++ })

    await runCron()

    expect(sentEvents()).toHaveLength(1)
    // 失敗しても接続は閉じる
    expect(closed).toBe(1)
  })
})

// AC ではない確認：本番・開発の両方に、毎日1回の Cron がある
describe('Cron の設定', () => {
  it.each([
    ['本番', undefined],
    ['開発', 'dev'],
  ])('%s の wrangler.toml に毎日1回の Cron がある', (_label, envName) => {
    const config = unstable_readConfig(
      { config: join(import.meta.dirname, '../wrangler.toml'), env: envName },
      { hideWarnings: true },
    )
    expect(config.triggers.crons).toHaveLength(1)
    // 分・時が固定で、日・月・曜日が * （毎日1回）
    expect(config.triggers.crons?.[0]).toMatch(/^\d+ \d+ \* \* \*$/)
  })
})
