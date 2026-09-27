import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { vi } from 'vitest'

type Listener = (event: AuthChangeEvent, session: Session | null) => void

// supabase-js の代わり（テスト用）。端末の保存領域にあるセッションを setStoredSession で決める
function createFakeSupabase() {
  let session: Session | null = null
  const listeners = new Set<Listener>()
  const notify = (event: AuthChangeEvent) => listeners.forEach((l) => l(event, session))

  const auth = {
    onAuthStateChange(listener: Listener) {
      listeners.add(listener)
      // supabase-js と同じく、登録の直後に今のセッションを INITIAL_SESSION で知らせる
      queueMicrotask(() => listener('INITIAL_SESSION', session))
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } }
    },
    async getSession() {
      return { data: { session }, error: null }
    },
    // 本物は Google の画面へ移る。テストでは呼ばれたことだけを記録する
    signInWithOAuth: vi.fn<(credentials: unknown) => Promise<unknown>>(async () => ({
      data: { provider: 'google', url: 'https://accounts.google.com/o/oauth2/auth' },
      error: null,
    })),
    // Google から戻ってきたコードをセッションに引き換える。本物と同じく、保存してから SIGNED_IN を知らせる
    exchangeCodeForSession: vi.fn<(code: string) => Promise<unknown>>(async () => {
      session = testSession()
      notify('SIGNED_IN')
      return { data: { session, user: session.user }, error: null }
    }),
  }

  return {
    auth,
    setStoredSession(next: Session | null) {
      session = next
    },
    reset() {
      session = null
      listeners.clear()
      auth.signInWithOAuth.mockClear()
      auth.exchangeCodeForSession.mockClear()
    },
  }
}

export const fakeSupabase = createFakeSupabase()

// テスト用のセッション（中身は使う項目だけ）
export function testSession(overrides: Partial<Session> = {}): Session {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: '6f1c2b1e-7d4a-4c1e-9a55-3f0a2d8b9c10',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-09-27T00:00:00Z',
    },
    ...overrides,
  }
}
