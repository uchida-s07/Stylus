import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { fakeSupabase } from './fakeSupabase'

// supabase-js をテスト用の偽物に差し替える
vi.mock('../src/auth/supabase', () => ({ supabase: fakeSupabase }))

beforeEach(() => {
  fakeSupabase.reset()
  // テストが本物のネットワークへ出ないように。API を使うテストは installFakeApi で差し替える
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`テストで API の偽物を用意していない: ${String(input)}`)
    }),
  )
})

afterEach(() => {
  cleanup()
})

// Mantine が使うブラウザの API（jsdom に無いもの）
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver ??= ResizeObserverStub
