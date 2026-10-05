import type { MeResponse } from '@stylus/shared'
import { vi } from 'vitest'
import { fakeSupabase } from './fakeSupabase'

export const TEST_API_URL = 'https://api.test'

export const MOTHER: MeResponse = {
  id: '0b7e4a52-93f1-4d6b-8c2e-5a1f9d3e7c64',
  displayName: '母',
  isAdmin: false,
  isParent: true,
  isCook: true,
}

type Handler = (request: Request) => Response | Promise<Response>

// 「GET /bills/:id」のような形のキーにも合わせる（: で始まる部分は何にでも合う）
function findRoute(routes: Record<string, Handler>, method: string, pathname: string) {
  const exact = routes[`${method} ${pathname}`]
  if (exact) return exact
  const parts = pathname.split('/')
  for (const [key, handler] of Object.entries(routes)) {
    const [m, pattern] = key.split(' ')
    const patternParts = pattern?.split('/') ?? []
    if (m !== method || patternParts.length !== parts.length) continue
    if (patternParts.every((p, i) => p.startsWith(':') || p === parts[i])) return handler
  }
  return undefined
}

// API の代わり（テスト用）。fetch を差し替え、届いた要求を記録する
// routes のキーは「メソッド パス」。パスに :id のような部分を書くと、その部分は何にでも合う
export function installFakeApi(routes: Record<string, Handler>) {
  const requests: Request[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      const handler =
        url.origin === TEST_API_URL ? findRoute(routes, request.method, url.pathname) : undefined
      return handler ? handler(request) : new Response('not found', { status: 404 })
    }),
  )
  return { requests }
}

export const json = (body: unknown, status = 200) => Response.json(body, { status })

// 通信できない（ブラウザの fetch と同じく TypeError で失敗する）
export const networkDown: Handler = () => {
  throw new TypeError('Failed to fetch')
}

// API の GET /me の代わり。本物と同じく、アクセストークンが通らなければ 401 を返す
// （トークンは Supabase の偽物のサーバーが発行し、期限が切れていないものだけ通す）
export function meRoute(member: MeResponse): Handler {
  return (request) => {
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '')
    return fakeSupabase.server.acceptsAccessToken(token)
      ? json(member)
      : json({ error: { code: 'unauthenticated', message: 'unauthenticated' } }, 401)
  }
}
