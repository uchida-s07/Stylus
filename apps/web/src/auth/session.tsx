import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useEffect, useState, type ReactNode } from 'react'
import { SessionContext, type SessionState } from './session-context'
import { supabase } from './supabase'

// supabase-js のログイン状態を画面に伝える。最初の通知（INITIAL_SESSION）で保存領域のセッションが届く
// （期限切れなら supabase-js が更新してから届く）
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) return setState({ status: 'signedIn', session })
      if (event !== 'INITIAL_SESSION') return setState({ status: 'signedOut' })
      // セッションが届かなかったのが、通信できずに更新できなかったためか（端末にセッションは残っている）を確かめる
      // 通知の中で supabase-js を待つと詰まることがあるので、通知を返してから確かめる
      setTimeout(() => void settleInitial(), 0)
    })

    async function settleInitial() {
      const { error } = await supabase.auth.getSession()
      if (!active) return
      const next: SessionState = isAuthRetryableFetchError(error)
        ? { status: 'offline' }
        : { status: 'signedOut' }
      // 確かめている間にログインなどの通知が来ていたら、そちらを優先する
      setState((prev) => (prev.status === 'loading' ? next : prev))
    }

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return <SessionContext value={state}>{children}</SessionContext>
}
