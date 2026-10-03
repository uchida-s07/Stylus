import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { AppRoot } from '../src/app/AppRoot'
import { routes } from '../src/router'

// 本番と同じ組み立てで、指定した URL を開く。visited には通った画面の URL を順に残す
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const visited = [router.state.location.pathname]
  router.subscribe((state) => visited.push(state.location.pathname))
  return { router, visited, ...render(<AppRoot router={router} />) }
}
