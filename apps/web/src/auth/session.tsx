import { useEffect, useState, type ReactNode } from 'react'
import { SessionContext, type SessionState } from './session-context'
import { supabase } from './supabase'

// supabase-js のログイン状態を画面に伝える。最初の通知（INITIAL_SESSION）で保存領域のセッションが届く
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: 'signedIn', session } : { status: 'signedOut' })
    })
    return () => subscription.unsubscribe()
  }, [])

  return <SessionContext value={state}>{children}</SessionContext>
}
