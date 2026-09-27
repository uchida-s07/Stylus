import type { RouteObject } from 'react-router'
import { RedirectIfSignedIn, RequireSignedIn } from './auth/guards'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'

// 画面：ログイン画面（/login）、アプリのホーム（/）、Google から戻る先（/auth/callback）
export const routes: RouteObject[] = [
  { element: <RequireSignedIn />, children: [{ path: '/', element: <HomePage /> }] },
  { element: <RedirectIfSignedIn />, children: [{ path: '/login', element: <LoginPage /> }] },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
]
