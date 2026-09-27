import { Hono } from 'hono'
import { corsMiddleware } from './middleware/cors'

// Worker の env のうち、アプリの組み立てに使うもの（wrangler.toml の vars）
export type AppEnv = {
  CORS_ALLOWED_ORIGINS: string[]
}

export type AppConfig = {
  corsAllowedOrigins: readonly string[]
}

export function configFromEnv(env: AppEnv): AppConfig {
  return { corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS }
}

export function createApp(config: AppConfig) {
  const app = new Hono()
  app.use('*', corsMiddleware(config.corsAllowedOrigins))
  return app
}
