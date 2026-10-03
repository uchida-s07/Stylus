import type { CloudflareOptions, ErrorEvent } from '@sentry/cloudflare'
import type { WorkerBindings } from './env'

// 送らない要求のヘッダー（アクセストークンやクッキー）
const SENSITIVE_HEADERS = ['authorization', 'cookie']

// Sentry に送る前に、要求の情報からアクセストークンとクッキーを消す（COMMON-N-011/AC-2）
// SDK も既定で Authorization を [Filtered] にするが、SDK の設定や版に頼らないようにこちらでも消す
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (!event.request) return event
  const request = {
    ...event.request,
    headers: Object.fromEntries(
      Object.entries(event.request.headers ?? {}).filter(
        ([name]) => !SENSITIVE_HEADERS.includes(name.toLowerCase()),
      ),
    ),
  }
  delete request.cookies
  return { ...event, request }
}

// Sentry の設定（COMMON-N-011）。本番・開発は environment で分ける。DSN が無ければ送らない
// overrides はテストで送信口（transport）を差し替えるためのもの
export function sentryOptions(
  env: WorkerBindings,
  overrides: Partial<CloudflareOptions> = {},
): CloudflareOptions {
  return {
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    // 家族のデータ（要求の本文・DB の値）やクッキーは集めない。ヘッダーはトークンとクッキー以外を集める
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { deny: SENSITIVE_HEADERS }, response: false },
      httpBodies: [],
      urlQueryParams: true,
      databaseQueryData: false,
    },
    beforeSend: scrubEvent,
    ...overrides,
  }
}
