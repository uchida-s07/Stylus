import '@mantine/core/styles.css'

import { MantineProvider, Text } from '@mantine/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'

const router = createBrowserRouter([{ path: '/', element: <Text p="md">Stylus</Text> }])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider>
      <RouterProvider router={router} />
    </MantineProvider>
  </StrictMode>,
)
