import type { RouteObject } from 'react-router'
import { RedirectIfSignedIn, RequireSignedIn } from './auth/guards'
import { RouteError } from './components/RouteError'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'

// 画面：ログイン画面（/login）、アプリのホーム（/）、Google から戻る先（/auth/callback）
// すべての画面を1つの親でくるみ、描画中の予期しないエラーと無い URL を RouteError で受ける
export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      { element: <RequireSignedIn />, children: [{ path: '/', element: <HomePage /> }] },
      { element: <RedirectIfSignedIn />, children: [{ path: '/login', element: <LoginPage /> }] },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
    ],
  },
]
