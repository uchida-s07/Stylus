import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { AppRoot } from '../src/app/AppRoot'
import { routes } from '../src/router'

// 本番と同じ組み立てで、指定した URL を開く
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return { router, ...render(<AppRoot router={router} />) }
}
