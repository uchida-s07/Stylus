import { createApp, type AppConfig } from '../src/app'
import { createTokenVerifier } from '../src/middleware/auth'
import { createTestDb } from './db'
import { TEST_ISSUER, testJwks } from './jwt'

// DB を使わないテスト（CORS など）の設定。DB を開こうとしたら失敗させる
export function testAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    corsAllowedOrigins: [],
    verifyToken: createTokenVerifier({ issuer: TEST_ISSUER, jwks: testJwks }),
    openDb: () => {
      throw new Error('このテストでは DB を使わない')
    },
    reportError: () => {},
    now: () => new Date(),
    ...overrides,
  }
}

// PGlite の DB とテスト用の鍵でアプリを組み立てる
export async function createTestApp(overrides: Partial<AppConfig> = {}) {
  const testDb = await createTestDb()
  const app = createApp(
    testAppConfig({
      openDb: () => ({ db: testDb.db, close: async () => {} }),
      ...overrides,
    }),
  )
  return { app, db: testDb.db, close: testDb.close }
}
