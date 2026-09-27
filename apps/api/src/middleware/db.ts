import type { Context, MiddlewareHandler } from 'hono'
import type { DbSession } from '../db/client'
import type { AppHono, WorkerBindings } from '../env'

// 要求ごとに DB を開いて c.var.db に置き、応答の後に閉じる
export function dbMiddleware(open: (env: WorkerBindings) => DbSession): MiddlewareHandler<AppHono> {
  return async (c, next) => {
    const session = open(c.env)
    c.set('db', session.db)
    try {
      await next()
    } finally {
      const closing = session.close()
      const ctx = executionCtxOf(c)
      if (ctx) ctx.waitUntil(closing)
      else await closing
    }
  }
}

// テスト（app.request）では executionCtx が無く、読むと例外になる
function executionCtxOf(c: Context) {
  try {
    return c.executionCtx
  } catch {
    return undefined
  }
}
