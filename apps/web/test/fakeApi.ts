import type { MeResponse } from '@stylus/shared'
import { vi } from 'vitest'

export const TEST_API_URL = 'https://api.test'

export const MOTHER: MeResponse = {
  id: '0b7e4a52-93f1-4d6b-8c2e-5a1f9d3e7c64',
  displayName: '母',
  isAdmin: false,
  isParent: true,
  isCook: true,
}

type Handler = (request: Request) => Response | Promise<Response>

// API の代わり（テスト用）。fetch を差し替え、届いた要求を記録する
export function installFakeApi(routes: Record<string, Handler>) {
  const requests: Request[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      const handler =
        url.origin === TEST_API_URL ? routes[`${request.method} ${url.pathname}`] : undefined
      return handler ? handler(request) : new Response('not found', { status: 404 })
    }),
  )
  return { requests }
}

export const json = (body: unknown, status = 200) => Response.json(body, { status })
