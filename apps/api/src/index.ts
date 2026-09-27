import { withSentry, type CloudflareOptions } from '@sentry/cloudflare'
import { createApp, type AppConfig } from './app'
import { configFromEnv } from './config'
import type { WorkerBindings } from './env'
import { sentryOptions } from './sentry'

// Worker の入り口を組み立てる。テストでは設定と Sentry の送信口を差し替えて使う
export function createWorker(
  buildConfig: (env: WorkerBindings) => AppConfig,
  buildSentryOptions: (env: WorkerBindings) => CloudflareOptions,
) {
  // env は要求のたびに渡されるので、最初の要求でアプリを組み立て、以後は使い回す
  let app: ReturnType<typeof createApp> | undefined
  return withSentry(buildSentryOptions, {
    fetch(request, env, ctx) {
      app ??= createApp(buildConfig(env))
      return app.fetch(request, env, ctx)
    },
  } satisfies ExportedHandler<WorkerBindings>)
}

export default createWorker(configFromEnv, (env) => sentryOptions(env))
