import { useEffect, useRef } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { useSession } from '../auth/session-context'
import { supabase } from '../auth/supabase'
import { Loading } from '../components/Loading'

// Google から戻る先（AUTH-F-002）。戻ってきたコードをセッションに引き換え、ログインできたらホームへ
// 失敗・未登録・キャンセルの扱いは T-16
export function AuthCallbackPage() {
  const [params] = useSearchParams()
  const code = params.get('code')
  const session = useSession()
  // 開発時の StrictMode では effect が2回走る。コードは1回しか使えないので、引き換えは1回だけにする
  const started = useRef(false)

  useEffect(() => {
    if (!code || started.current) return
    started.current = true
    void supabase.auth.exchangeCodeForSession(code)
  }, [code])

  if (session.status === 'signedIn') return <Navigate to="/" replace />
  return <Loading />
}
