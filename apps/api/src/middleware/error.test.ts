import {
  captureException,
  createTransport,
  type CloudflareOptions,
  type ErrorEvent,
} from '@sentry/cloudflare'
import { apiErrorSchema } from '@stylus/shared'
import { describe, expect, it } from 'vitest'
import { testAppConfig } from '../../test/app'
import { signTestToken } from '../../test/jwt'
import type { WorkerBindings } from '../env'
import { createWorker } from '../index'
import { sentryOptions } from '../sentry'

const env = {
  CORS_ALLOWED_ORIGINS: ['http://localhost:5173'],
  SUPABASE_URL: 'https://test-project.supabase.co',
  SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0',
  SENTRY_ENVIRONMENT: 'test',
} as WorkerBindings

const SUB = '6f1c2b1e-7d4a-4c1e-9a55-3f0a2d8b9c10'

// Sentry へ送る直前の中身（envelope）を受け止める送信口
function captureTransport(sent: string[]): CloudflareOptions['transport'] {
  return (options) =>
    createTransport(options, async (request) => {
      sent.push(
        typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body),
      )
      return { statusCode: 200 }
    })
}

// envelope（改行区切りの JSON）から event の項目を取り出す
function eventsIn(envelopes: string[]) {
  return envelopes.flatMap((envelope) => {
    const lines = envelope.split('\n').filter(Boolean)
    const events: unknown[] = []
    for (let i = 1; i + 1 < lines.length; i += 2) {
      if (JSON.parse(lines[i]!).type === 'event') events.push(JSON.parse(lines[i + 1]!))
    }
    return events
  })
}

// Sentry の SDK は client をプロセスに1つだけ持つので、Worker と送信口はテストの間で使い回し、
// テストごとに受け止めた中身を空にする。例外の文言はテストごとに変える（同じ例外が続くと SDK が重複として落とす）
const sent: string[] = []
let failure = new TypeError('JWKS に届かない')

const worker = createWorker(
  () =>
    testAppConfig({
      corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS,
      // トークンの検証で JWKS に届かない、を模す
      verifyToken: async () => {
        throw failure
      },
      reportError: (error) => captureException(error),
    }),
  (e) => sentryOptions(e, { transport: captureTransport(sent) }),
)

// 予期しない例外を起こす Worker を、本物の Sentry の SDK で包んで呼ぶ
async function callFailingWorker(headers: Record<string, string>, message: string) {
  sent.length = 0
  failure = new TypeError(message)
  const pending: Promise<unknown>[] = []
  const ctx = {
    waitUntil: (p: Promise<unknown>) => pending.push(p),
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext
  const res = await worker.fetch!(
    new Request('https://api.example.com/me', { headers }) as Parameters<
      NonNullable<typeof worker.fetch>
    >[0],
    env,
    ctx,
  )
  await Promise.all(pending)
  return { res, sent: [...sent] }
}

describe('予期しないエラー（COMMON-N-011）', () => {
  it('[COMMON-N-011/AC-1] API の処理が予期しない例外を投げると、500 が返り Sentry への送信が1回行われる', async () => {
    const token = await signTestToken({ sub: SUB })
    const { res, sent } = await callFailingWorker(
      { Authorization: `Bearer ${token}` },
      'AC-1 の例外',
    )

    expect(res.status).toBe(500)
    expect(eventsIn(sent)).toHaveLength(1)
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('internal')
  })

  it('[COMMON-N-011/AC-2] Authorization ヘッダー付きの要求で例外が起きても、Sentry に送る内容にアクセストークンが含まれない', async () => {
    const token = await signTestToken({ sub: SUB })
    const { sent } = await callFailingWorker(
      { Authorization: `Bearer ${token}`, 'User-Agent': 'test-agent' },
      'AC-2 の例外',
    )

    const events = eventsIn(sent)
    // 送られていなければこの確認は意味を持たないので、まず1回送られたことを確かめる
    expect(events).toHaveLength(1)
    // 要求の情報（ヘッダー）は送られている
    expect(JSON.stringify(events)).toContain('test-agent')
    for (const envelope of sent) {
      expect(envelope).not.toContain(token)
    }
  })

  // SDK の既定のふるまい（Authorization を [Filtered] にする）に頼らず、送る前にこちらでも消す
  it('[COMMON-N-011/AC-2] Sentry に送る前の処理で、要求のヘッダーとクッキーからトークンを消す', async () => {
    const token = await signTestToken({ sub: SUB })
    const beforeSend = sentryOptions(env).beforeSend!
    const event: ErrorEvent = {
      type: undefined,
      request: {
        url: 'https://api.example.com/me',
        headers: { Authorization: `Bearer ${token}`, Cookie: `sb=${token}`, 'User-Agent': 'ua' },
        cookies: { sb: token },
      },
    }

    const scrubbed = await beforeSend(event, {})

    expect(JSON.stringify(scrubbed)).not.toContain(token)
    expect(scrubbed?.request?.headers).toEqual({ 'User-Agent': 'ua' })
  })

  // AC ではない確認：フロントが 500 を読めるように、500 の応答にも CORS のヘッダーが付く
  it('500 の応答にも、許可したオリジンなら Access-Control-Allow-Origin が付く', async () => {
    const token = await signTestToken({ sub: SUB })
    const { res } = await callFailingWorker(
      { Authorization: `Bearer ${token}`, Origin: 'http://localhost:5173' },
      'CORS の確認の例外',
    )

    expect(res.status).toBe(500)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
  })
})
