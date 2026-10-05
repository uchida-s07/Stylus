import type { ApiError, ApiErrorCode } from '@stylus/shared'

// エラーの応答の本文：{ error: { code, message } }
export function apiError(code: ApiErrorCode, message: string): ApiError {
  return { error: { code, message } }
}

// 想定した失敗（400・403・404・409）。ルートや money/ の処理から投げ、エラー処理（errorHandler）が応答にする
export class ApiFailure extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly body: ApiError,
  ) {
    super(body.error.message)
    this.name = 'ApiFailure'
  }
}

export function fail(status: 400 | 403 | 404 | 409, code: ApiErrorCode, message: string): never {
  throw new ApiFailure(status, apiError(code, message))
}

// 400 invalid_input（項目ごとの知らせつき）
export function failInput(fields: Record<string, string>): never {
  throw new ApiFailure(400, {
    error: { ...apiError('invalid_input', '入力が正しくありません').error, fields },
  })
}
