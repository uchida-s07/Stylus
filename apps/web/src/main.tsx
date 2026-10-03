import '@mantine/core/styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { AppRoot } from './app/AppRoot'
import { routes } from './router'
import { initSentry, reactErrorHandler } from './sentry'

initSentry()

const router = createBrowserRouter(routes)

// 画面の外側（ルーターより上）で起きた描画中のエラーも Sentry へ送る
createRoot(document.getElementById('root')!, { onUncaughtError: reactErrorHandler() }).render(
  <StrictMode>
    <AppRoot router={router} />
  </StrictMode>,
)
