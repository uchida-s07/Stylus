import '@mantine/core/styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { AppRoot } from './app/AppRoot'
import { routes } from './router'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot router={router} />
  </StrictMode>,
)
