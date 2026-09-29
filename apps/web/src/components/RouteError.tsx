import { useEffect } from 'react'
import { isRouteErrorResponse, Navigate, useRouteError } from 'react-router'
import { reportError } from '../sentry'
import { ErrorScreen } from './ErrorScreen'

// 画面の描画中に起きた予期しないエラー（React Router が捕まえる）。Sentry へ送り、「うまく読み込めませんでした。…」を出す
// 無い URL を開いたときはエラーにせず、ホームへ送る（ログインしていなければ、見張りがログイン画面へ送る）
export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404

  useEffect(() => {
    if (!notFound) reportError(error)
  }, [error, notFound])

  if (notFound) return <Navigate to="/" replace />
  return <ErrorScreen kind="loadFailed" />
}
