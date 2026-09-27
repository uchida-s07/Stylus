import type { ErrorHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppHono } from '../env'
import { apiError } from '../errors'

// 捕まえていない例外を 500 internal にし、知らせる（COMMON-N-011）
export function errorHandler(reportError: (error: unknown) => void): ErrorHandler<AppHono> {
  return (error, c) => {
    // Hono が意図して投げる HTTP のエラー（不正な JSON など）は、そのまま返す
    if (error instanceof HTTPException) return error.getResponse()
    reportError(error)
    return c.json(apiError('internal', 'うまく処理できませんでした'), 500)
  }
}
