import type { MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'

// サブドメイン1階層（英小文字・数字・ハイフン。ドットを含まない）
const LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?'

// 許可するオリジンの書き方：完全一致。`*` はサブドメイン1階層だけに当たる
// 例：`https://*.stylus-family.pages.dev` は `https://develop.stylus-family.pages.dev` に当たり、
// `https://a.b.stylus-family.pages.dev` や `http://develop.stylus-family.pages.dev` には当たらない
function toMatcher(pattern: string): RegExp {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
    .join(LABEL)
  return new RegExp(`^${escaped}$`)
}

// CORS：許可するオリジンだけに Access-Control-Allow-Origin を返す（COMMON-N-005）
export function corsMiddleware(allowedOrigins: readonly string[]): MiddlewareHandler {
  const matchers = allowedOrigins.map(toMatcher)
  return cors({
    origin: (origin) => (matchers.some((m) => m.test(origin)) ? origin : null),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  })
}
