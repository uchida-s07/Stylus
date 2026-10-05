import type { RouteObject } from 'react-router'
import { RedirectIfSignedIn, RequireSignedIn } from './auth/guards'
import { RouteError } from './components/RouteError'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { BillDetailPage } from './pages/money/BillDetailPage'
import { BillEditPage } from './pages/money/BillEditPage'
import { BillNewPage } from './pages/money/BillNewPage'
import { MoneyPage } from './pages/money/MoneyPage'
import { SettlePage } from './pages/money/SettlePage'
import { SettlementDetailPage } from './pages/money/SettlementDetailPage'

// 画面：ログイン画面（/login）、アプリのホーム（/）、Google から戻る先（/auth/callback）、お金（/money 以下）
// すべての画面を1つの親でくるみ、描画中の予期しないエラーと無い URL を RouteError で受ける
export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      {
        element: <RequireSignedIn />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/money', element: <MoneyPage /> },
          { path: '/money/bills/new', element: <BillNewPage /> },
          { path: '/money/bills/:id', element: <BillDetailPage /> },
          { path: '/money/bills/:id/edit', element: <BillEditPage /> },
          { path: '/money/settle', element: <SettlePage /> },
          { path: '/money/settlements/:id', element: <SettlementDetailPage /> },
        ],
      },
      { element: <RedirectIfSignedIn />, children: [{ path: '/login', element: <LoginPage /> }] },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
    ],
  },
]
