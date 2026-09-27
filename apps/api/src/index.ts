import { createApp } from './app'
import { configFromEnv } from './config'
import type { WorkerBindings } from './env'

// env は要求のたびに渡されるので、最初の要求でアプリを組み立て、以後は使い回す
let app: ReturnType<typeof createApp> | undefined

export default {
  fetch(request, env, ctx) {
    app ??= createApp(configFromEnv(env))
    return app.fetch(request, env, ctx)
  },
} satisfies ExportedHandler<WorkerBindings>
