import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

type Listener = (event: AuthChangeEvent, session: Session | null) => void

// supabase-js の代わり（テスト用）。端末の保存領域にあるセッションを setStoredSession で決める
function createFakeSupabase() {
  let session: Session | null = null
  const listeners = new Set<Listener>()

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
  }

  return {
    auth,
    setStoredSession(next: Session | null) {
      session = next
    },
    reset() {
      session = null
      listeners.clear()
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
