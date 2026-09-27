import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

// 端末のログイン状態。loading の間は、まだ保存領域のセッションを読み終えていない
export type SessionState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; session: Session }

export const SessionContext = createContext<SessionState>({ status: 'loading' })

export function useSession() {
  return useContext(SessionContext)
}
