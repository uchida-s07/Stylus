import { captureException } from '@sentry/cloudflare'
import { createRemoteJWKSet } from 'jose'
import type { AppConfig } from './app'
import { openHyperdriveDb } from './db/client'
import type { WorkerBindings } from './env'
import { createTokenVerifier } from './middleware/auth'

// Worker の env からアプリの設定を作る。JWKS の鍵は createRemoteJWKSet が Worker のメモリに置いて使い回す
export function configFromEnv(env: WorkerBindings): AppConfig {
  const authBase = `${env.SUPABASE_URL}/auth/v1`
  return {
    corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS,
    verifyToken: createTokenVerifier({
      issuer: authBase,
      jwks: createRemoteJWKSet(new URL(`${authBase}/.well-known/jwks.json`)),
    }),
    openDb: (e) => openHyperdriveDb(e.HYPERDRIVE.connectionString),
    // withSentry の中で呼ばれるので、要求の情報は SDK が付ける
    reportError: (error) => captureException(error),
  }
}
