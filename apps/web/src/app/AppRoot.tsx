import { MantineProvider } from '@mantine/core'
import { RouterProvider, type createBrowserRouter } from 'react-router'
import { SessionProvider } from '../auth/session'

type Router = ReturnType<typeof createBrowserRouter>

// 画面全体の組み立て（本番の main.tsx とテストで同じものを使う）
export function AppRoot({ router }: { router: Router }) {
  return (
    <MantineProvider>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </MantineProvider>
  )
}
