import { withSentry, type CloudflareOptions } from '@sentry/cloudflare'
import { createApp, type AppConfig } from './app'
import { configFromEnv } from './config'
import type { WorkerBindings } from './env'
import { keepAlive } from './scheduled'
import { sentryOptions } from './sentry'

// Worker の入り口を組み立てる。テストでは設定と Sentry の送信口を差し替えて使う
// fetch・scheduled で捕まえていない例外は withSentry が Sentry に送る
export function createWorker(
  buildConfig: (env: WorkerBindings) => AppConfig,
  buildSentryOptions: (env: WorkerBindings) => CloudflareOptions,
) {
  // env は呼ばれるたびに渡されるので、最初に設定とアプリを組み立て、以後は使い回す
  let config: AppConfig | undefined
  let app: ReturnType<typeof createApp> | undefined
  const configOf = (env: WorkerBindings) => (config ??= buildConfig(env))

  return withSentry(buildSentryOptions, {
    fetch(request, env, ctx) {
      app ??= createApp(configOf(env))
      return app.fetch(request, env, ctx)
    },
    // Cron（毎日）：Supabase に1回問い合わせる
    async scheduled(_controller, env) {
      const { openDb } = configOf(env)
      await keepAlive(() => openDb(env))
    },
  } satisfies ExportedHandler<WorkerBindings>)
}

export default createWorker(configFromEnv, (env) => sentryOptions(env))
