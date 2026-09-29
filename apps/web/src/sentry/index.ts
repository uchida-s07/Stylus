import * as Sentry from '@sentry/react'
import { sentryOptions } from './options'

// 予期しないエラーを Sentry へ送る準備（COMMON-N-011）。DSN が無ければ（手元・テスト）送らない
// 捕まえていない例外と Promise の失敗は、SDK が window で拾う
export function initSentry() {
  if (!import.meta.env.VITE_SENTRY_DSN) return
  Sentry.init(sentryOptions())
}

// 画面で捕まえた予期しないエラーを送る
export function reportError(error: unknown) {
  Sentry.captureException(error)
}

// React が捕まえられなかった描画中のエラーを送る（createRoot の onUncaughtError に渡す）
export const reactErrorHandler = Sentry.reactErrorHandler
