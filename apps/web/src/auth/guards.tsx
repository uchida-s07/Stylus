import { Navigate, Outlet } from 'react-router'
import { ErrorScreen } from '../components/ErrorScreen'
import { Loading } from '../components/Loading'
import { useSession } from './session-context'

// ログインしていなければログイン画面へ送る（AUTH-F-002/AC-4）
// 端末のセッションを読み終えるまでは何も出さない（ログイン画面が一瞬出ないように）
// 通信できずにセッションを更新できなかったときは、ログイン画面へ送らずに知らせる（AUTH-F-003/AC-3）
export function RequireSignedIn() {
  const session = useSession()
  if (session.status === 'loading') return <Loading />
  if (session.status === 'offline') return <ErrorScreen kind="network" />
  if (session.status === 'signedOut') return <Navigate to="/login" replace />
  return <Outlet />
}

// ログイン済みならホームへ送る（AUTH-F-002/AC-5）
export function RedirectIfSignedIn() {
  const session = useSession()
  if (session.status === 'loading') return <Loading />
  if (session.status === 'offline') return <ErrorScreen kind="network" />
  if (session.status === 'signedIn') return <Navigate to="/" replace />
  return <Outlet />
}
