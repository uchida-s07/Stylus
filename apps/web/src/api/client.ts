import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { hc } from 'hono/client'
// apps/api からは型だけを読む（実行コードは import しない。COMMON-N-010）
import type { AppType } from '../../../api/src/app'
import { supabase } from '../auth/supabase'

// 通信できずに API（または Supabase）へ届かなかった
export class NetworkError extends Error {
  constructor(options?: ErrorOptions) {
    super('network error', options)
    this.name = 'NetworkError'
  }
}

// アクセストークンを Authorization: Bearer で付けて送る（Cookie は使わない）
async function send(input: RequestInfo | URL, init: RequestInit | undefined, token?: string) {
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  try {
    return await fetch(input, { ...init, headers })
  } catch (cause) {
    throw new NetworkError({ cause })
  }
}

// トークンは supabase-js のセッションから取る（期限が近ければ supabase-js が更新する）
// 署名鍵の入れ替え直後や端末の時計のずれで、端末では期限内に見えても 401 になりうる。そのときは1回だけ更新して送り直す
// - 更新がログイン状態の無効で失敗：この端末のセッションを消す（見張りがログイン画面へ送る）。supabase-js は
//   端末でトークンが期限内に見えると自分では消さないため
// - 更新が通信エラーで失敗：ログイン状態は残して NetworkError
// - 送り直しても 401：そのまま返す
export async function authorizedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const { data, error: sessionError } = await supabase.auth.getSession()
  // 期限切れのトークンを通信できずに更新できなかった：トークン無しでは送らない
  if (isAuthRetryableFetchError(sessionError)) throw new NetworkError({ cause: sessionError })
  const res = await send(input, init, data.session?.access_token)
  if (res.status !== 401) return res

  const { data: refreshed, error } = await supabase.auth.refreshSession()
  if (error) {
    if (isAuthRetryableFetchError(error)) throw new NetworkError({ cause: error })
    await supabase.auth.signOut({ scope: 'local' })
    return res
  }
  return send(input, init, refreshed.session?.access_token)
}

// API の呼び出し（Hono RPC）
export const api = hc<AppType>(import.meta.env.VITE_API_URL, { fetch: authorizedFetch })
