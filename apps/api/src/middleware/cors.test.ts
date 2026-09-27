import { join } from 'node:path'
import { unstable_readConfig } from 'wrangler'
import { describe, expect, it } from 'vitest'
import { configFromEnv, createApp, type AppEnv } from '../app'

// wrangler.toml の実際の設定（本番・[env.dev]）からアプリを組み立てる
function appFor(env: 'production' | 'dev') {
  const config = unstable_readConfig(
    {
      config: join(import.meta.dirname, '../../wrangler.toml'),
      env: env === 'dev' ? 'dev' : undefined,
    },
    { hideWarnings: true },
  )
  return createApp(configFromEnv(config.vars as AppEnv))
}

// CORS の事前確認（preflight）を送り、返ってきた Access-Control-Allow-Origin を返す
async function preflight(app: ReturnType<typeof createApp>, origin: string) {
  const res = await app.request('/me', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
  })
  return res.headers.get('Access-Control-Allow-Origin')
}

describe('CORS（COMMON-N-005）', () => {
  const production = appFor('production')
  const dev = appFor('dev')

  it('[COMMON-N-005/AC-1] 本番用の設定で、本番のフロントのオリジンを許可する', async () => {
    expect(await preflight(production, 'https://stylus-family.pages.dev')).toBe(
      'https://stylus-family.pages.dev',
    )
  })

  it.each([
    'https://example.com',
    'https://stylus.pages.dev',
    'http://localhost:5173',
    'https://spec-001-foundation.stylus-family.pages.dev',
  ])('[COMMON-N-005/AC-2] 本番用の設定で、%s を許可しない', async (origin) => {
    expect(await preflight(production, origin)).toBeNull()
  })

  it.each([
    'https://spec-001-foundation.stylus-family.pages.dev',
    'https://develop.stylus-family.pages.dev',
    'http://localhost:5173',
  ])('[COMMON-N-005/AC-3] 開発用の設定で、%s を許可する', async (origin) => {
    expect(await preflight(dev, origin)).toBe(origin)
  })

  it('[COMMON-N-005/AC-4] 開発用の設定で、https://example.com を許可しない', async () => {
    expect(await preflight(dev, 'https://example.com')).toBeNull()
  })

  it.each([
    'https://stylus-family.pages.dev.example.com',
    'https://xstylus-family.pages.dev',
    'https://other.pages.dev',
    'http://develop.stylus-family.pages.dev',
    'https://a.b.stylus-family.pages.dev',
  ])('[COMMON-N-005/AC-5] 開発用の設定で、よく似たオリジン %s を許可しない', async (origin) => {
    expect(await preflight(dev, origin)).toBeNull()
  })
})

// AC ではない確認：API の呼び方（Authorization: Bearer）が通ること
describe('CORS の中身', () => {
  const dev = appFor('dev')

  it('事前確認で Authorization ヘッダーを許可する', async () => {
    const res = await dev.request('/me', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    })
    expect(res.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain(
      'authorization',
    )
  })

  it('事前確認でない要求にも、許可したオリジンなら Access-Control-Allow-Origin を付ける', async () => {
    const res = await dev.request('/me', { headers: { Origin: 'http://localhost:5173' } })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
  })
})
