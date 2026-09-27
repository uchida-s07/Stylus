import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  type AuthChangeEvent,
  type AuthError,
  type Session,
} from '@supabase/supabase-js'
import { vi } from 'vitest'

type Listener = (event: AuthChangeEvent, session: Session | null) => void

// supabase-js と同じく、期限の90秒前から期限切れとみなして更新する
const EXPIRY_MARGIN_MS = 90 * 1000
const nowSeconds = () => Math.floor(Date.now() / 1000)

// Supabase Auth のサーバーの代わり。発行したトークンを覚えておき、API の偽物がトークンを確かめるのにも使う
function createAuthServer() {
  // アクセストークン → 期限（秒）
  const accessTokens = new Map<string, number>()
  const refreshTokens = new Set<string>()
  let offline = false
  let issued = 0

  function register(session: Session) {
    accessTokens.set(session.access_token, session.expires_at ?? 0)
    refreshTokens.add(session.refresh_token)
  }

  return {
    register,
    // ログイン状態（リフレッシュトークン）で新しいセッションを発行する。使ったリフレッシュトークンは使えなくなる
    refresh(
      refreshToken: string,
    ): { session: Session; error: null } | { session: null; error: AuthError } {
      if (offline)
        return { session: null, error: new AuthRetryableFetchError('Failed to fetch', 0) }
      if (!refreshTokens.delete(refreshToken)) {
        return {
          session: null,
          error: new AuthApiError(
            'Invalid Refresh Token: Refresh Token Not Found',
            400,
            'refresh_token_not_found',
          ),
        }
      }
      issued += 1
      const session = testSession({
        access_token: `refreshed-access-token-${issued}`,
        refresh_token: `refreshed-refresh-token-${issued}`,
        expires_at: nowSeconds() + 3600,
      })
      register(session)
      return { session, error: null }
    },
    // API がするのと同じ確かめ方：このサーバーが発行し、期限が切れていないトークンか
    acceptsAccessToken(token: string | undefined) {
      const expiresAt = token ? accessTokens.get(token) : undefined
      return expiresAt !== undefined && expiresAt * 1000 > Date.now()
    },
    // ログイン状態を無効にする（長く開かずに失効した、取り消された）
    invalidateLogins() {
      refreshTokens.clear()
    },
    // 署名鍵を入れ替える：今までのアクセストークンは期限内でも API に拒まれる
    rotateSigningKey() {
      accessTokens.clear()
    },
    setOffline(next: boolean) {
      offline = next
    },
    reset() {
      accessTokens.clear()
      refreshTokens.clear()
      offline = false
      issued = 0
    },
  }
}

// supabase-js の代わり（テスト用）。端末の保存領域にあるセッションを setStoredSession で決める
// 期限切れのセッションの扱いは supabase-js 2.117 に合わせる：
// - 開いたとき・getSession のときに期限切れなら更新してから返す
// - 更新がログイン状態の無効で失敗し、アクセストークンも期限切れなら、端末のセッションを消す
// - 通信できずに更新できなかったときは、端末のセッションを残す（返すのは null とエラー）
function createFakeSupabase() {
  const server = createAuthServer()
  let session: Session | null = null
  const listeners = new Set<Listener>()
  const notify = (event: AuthChangeEvent) => listeners.forEach((l) => l(event, session))
  // 次のコードの引き換えを失敗させるときのエラー
  let exchangeError: Error | null = null

  const expired = (s: Session, marginMs = 0) => (s.expires_at ?? 0) * 1000 - Date.now() < marginMs

  function removeSession() {
    session = null
    notify('SIGNED_OUT')
  }

  async function callRefreshToken(refreshToken: string) {
    const { session: next, error } = server.refresh(refreshToken)
    if (error) {
      if (!(error instanceof AuthRetryableFetchError) && session && expired(session))
        removeSession()
      return { session: null, error }
    }
    session = next
    notify('TOKEN_REFRESHED')
    return { session: next, error: null }
  }

  async function loadSession(): Promise<{ session: Session | null; error: AuthError | null }> {
    if (!session) return { session: null, error: null }
    if (!expired(session, EXPIRY_MARGIN_MS)) return { session, error: null }
    const refreshed = await callRefreshToken(session.refresh_token)
    if (!refreshed.error) return refreshed
    // 更新に失敗しても、残っているアクセストークンがまだ期限内ならそれを返す
    if (session && !expired(session)) return { session, error: null }
    return { session: null, error: refreshed.error }
  }

  const auth = {
    onAuthStateChange(listener: Listener) {
      listeners.add(listener)
      // supabase-js と同じく、登録の後に今のセッションを INITIAL_SESSION で知らせる（期限切れなら更新してから）
      void (async () => {
        const { session: initial } = await loadSession()
        listener('INITIAL_SESSION', initial)
      })()
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } }
    },
    async getSession() {
      const { session: current, error } = await loadSession()
      return { data: { session: current }, error }
    },
    // 期限にかかわらずセッションを更新する
    refreshSession: vi.fn(async () => {
      if (!session) {
        return { data: { session: null, user: null }, error: new AuthSessionMissingError() }
      }
      const { session: next, error } = await callRefreshToken(session.refresh_token)
      return { data: { session: next, user: next?.user ?? null }, error }
    }),
    // 本物は Google の画面へ移る。テストでは呼ばれたことだけを記録する
    signInWithOAuth: vi.fn<(credentials: unknown) => Promise<unknown>>(async () => ({
      data: { provider: 'google', url: 'https://accounts.google.com/o/oauth2/auth' },
      error: null,
    })),
    // Google から戻ってきたコードをセッションに引き換える。本物と同じく、保存してから SIGNED_IN を知らせる
    exchangeCodeForSession: vi.fn<(code: string) => Promise<unknown>>(async () => {
      if (exchangeError) return { data: { session: null, user: null }, error: exchangeError }
      session = testSession()
      server.register(session)
      notify('SIGNED_IN')
      return { data: { session, user: session.user }, error: null }
    }),
    // 端末のセッションを消して SIGNED_OUT を知らせる（scope: 'local' はこの端末だけ）
    signOut: vi.fn<(options?: { scope?: string }) => Promise<unknown>>(async () => {
      removeSession()
      return { error: null }
    }),
  }

  return {
    auth,
    server,
    // 端末の保存領域にセッションを置く。サーバーもそのセッションを発行済みとして覚える
    setStoredSession(next: Session | null) {
      session = next
      if (next) server.register(next)
    },
    storedSession() {
      return session
    },
    failExchange(error: Error | null) {
      exchangeError = error
    },
    reset() {
      session = null
      exchangeError = null
      listeners.clear()
      server.reset()
      auth.refreshSession.mockClear()
      auth.signInWithOAuth.mockClear()
      auth.exchangeCodeForSession.mockClear()
      auth.signOut.mockClear()
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
    expires_at: nowSeconds() + 3600,
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
