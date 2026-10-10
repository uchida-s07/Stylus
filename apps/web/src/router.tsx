import type { RouteObject } from 'react-router'
import { RedirectIfSignedIn, RequireSignedIn } from './auth/guards'
import { RouteError } from './components/RouteError'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { CarPage } from './pages/car/CarPage'
import { ReservationDetailPage } from './pages/car/ReservationDetailPage'
import { ReservationEditPage } from './pages/car/ReservationEditPage'
import { ReservationNewPage } from './pages/car/ReservationNewPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { BillDetailPage } from './pages/money/BillDetailPage'
import { CategoriesPage } from './pages/money/CategoriesPage'
import { BillEditPage } from './pages/money/BillEditPage'
import { BillNewPage } from './pages/money/BillNewPage'
import { HistoryPage } from './pages/money/HistoryPage'
import { MoneyPage } from './pages/money/MoneyPage'
import { SettlePage } from './pages/money/SettlePage'
import { SettlementDetailPage } from './pages/money/SettlementDetailPage'

// 画面：ログイン画面（/login）、アプリのホーム（/）、Google から戻る先（/auth/callback）、お金（/money 以下）、車（/car 以下）
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
          { path: '/money/history', element: <HistoryPage /> },
          { path: '/money/bills/new', element: <BillNewPage /> },
          { path: '/money/bills/:id', element: <BillDetailPage /> },
          { path: '/money/bills/:id/edit', element: <BillEditPage /> },
          { path: '/money/settle', element: <SettlePage /> },
          { path: '/money/settlements/:id', element: <SettlementDetailPage /> },
          { path: '/money/categories', element: <CategoriesPage /> },
          { path: '/car', element: <CarPage /> },
          { path: '/car/reservations/new', element: <ReservationNewPage /> },
          { path: '/car/reservations/:id', element: <ReservationDetailPage /> },
          { path: '/car/reservations/:id/edit', element: <ReservationEditPage /> },
        ],
      },
      { element: <RedirectIfSignedIn />, children: [{ path: '/login', element: <LoginPage /> }] },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
    ],
  },
]
