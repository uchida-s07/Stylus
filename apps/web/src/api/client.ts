import { hc } from 'hono/client'
// apps/api からは型だけを読む（実行コードは import しない。COMMON-N-010）
import type { AppType } from '../../../api/src/app'
import { supabase } from '../auth/supabase'

// API の呼び出し（Hono RPC）。アクセストークンを Authorization: Bearer で付ける（Cookie は使わない）
// トークンは supabase-js のセッションから取る（期限が近ければ supabase-js が更新する）
export const api = hc<AppType>(import.meta.env.VITE_API_URL, {
  headers: async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  },
  // テストで差し替えられるように、呼ぶたびに今の fetch を使う
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
})
