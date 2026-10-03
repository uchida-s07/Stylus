import type { ApiError, ApiErrorCode } from '@stylus/shared'

// エラーの応答の本文：{ error: { code, message } }
export function apiError(code: ApiErrorCode, message: string): ApiError {
  return { error: { code, message } }
}
