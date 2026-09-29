import type { Breadcrumb, BrowserOptions, ErrorEvent } from '@sentry/react'

// 送らない要求のヘッダー（アクセストークンやクッキー）
const SENSITIVE_HEADERS = ['authorization', 'cookie']
// URL に付きうるログインの秘密（Google から戻ったときのコード、トークン）
const SENSITIVE_PARAMS = [
  'code',
  'access_token',
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
]

// URL からログインの秘密を消す（? の後ろも # の後ろも）
export function scrubUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url, 'http://placeholder.invalid')
  } catch {
    return url
  }
  const query = parsed.searchParams
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''))
  let changed = false
  for (const name of SENSITIVE_PARAMS) {
    for (const params of [query, fragment]) {
      if (params.has(name)) {
        params.set(name, '[Filtered]')
        changed = true
      }
    }
  }
  if (!changed) return url
  if (fragment.size > 0) parsed.hash = fragment.toString()
  const absolute = /^[a-z][a-z\d+.-]*:/i.test(url)
  return absolute ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`
}

// 画面の移動や通信の記録（breadcrumb）の URL から、ログインの秘密を消す
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (!breadcrumb.data) return breadcrumb
  const data = { ...breadcrumb.data }
  for (const key of ['url', 'from', 'to']) {
    if (typeof data[key] === 'string') data[key] = scrubUrl(data[key])
  }
  return { ...breadcrumb, data }
}

// Sentry に送る前に、アクセストークン・クッキー・URL のログインの秘密を消す（COMMON-N-011）
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const scrubbed = { ...event }
  if (event.request) {
    const request = {
      ...event.request,
      headers: Object.fromEntries(
        Object.entries(event.request.headers ?? {}).filter(
          ([name]) => !SENSITIVE_HEADERS.includes(name.toLowerCase()),
        ),
      ),
    }
    if (request.url) request.url = scrubUrl(request.url)
    delete request.cookies
    delete request.query_string
    scrubbed.request = request
  }
  if (event.breadcrumbs) scrubbed.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb)
  return scrubbed
}

// フロントの Sentry の設定（COMMON-N-011）。本番・開発は environment で分ける
// overrides はテストで送信口（transport）を差し替えるためのもの
export function sentryOptions(overrides: Partial<BrowserOptions> = {}): BrowserOptions {
  return {
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.SENTRY_ENVIRONMENT,
    // 利用者の情報・クッキー・ヘッダー・本文・URL のクエリは集めない
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    // 既定では通信エラーの文言そのものを書き換える。画面の処理が文言に頼らないよう、送る内容だけに付ける
    enhanceFetchErrorMessages: 'report-only',
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
    ...overrides,
  }
}
