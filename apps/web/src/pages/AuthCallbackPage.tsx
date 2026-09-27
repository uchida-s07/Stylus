import { useEffect, useRef } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { readCallback, setLoginNotice, type LoginNotice } from '../auth/errors'
import { useSession } from '../auth/session-context'
import { supabase } from '../auth/supabase'
import { Loading } from '../components/Loading'

// Google から戻る先（AUTH-F-002）。戻ってきたコードをセッションに引き換え、ログインできたらホームへ
// キャンセルならログイン画面へ（メッセージなし）、弾かれた・失敗したらログイン画面にメッセージを出す
export function AuthCallbackPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const session = useSession()
  // 開発時の StrictMode では effect が2回走る。コードは1回しか使えないので、読み分けと引き換えは1回だけにする
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const toLogin = (notice?: LoginNotice) => {
      setLoginNotice(notice)
      navigate('/login', { replace: true })
    }

    const result = readCallback(location.search, location.hash)
    if (result.kind === 'cancelled') return void toLogin()
    if (result.kind === 'error') return void toLogin(result.notice)

    void (async () => {
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(result.code)
        if (error) toLogin('failed')
      } catch {
        toLogin('failed')
      }
    })()
  }, [location.search, location.hash, navigate])

  if (session.status === 'signedIn') return <Navigate to="/" replace />
  return <Loading />
}
