import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

// 端末のログイン状態。loading の間は、まだ保存領域のセッションを読み終えていない
// offline は、端末にセッションは残っているが、期限切れのトークンを通信できずに更新できなかった
export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; session: Session }
  | { status: 'offline' }

export const SessionContext = createContext<SessionState>({ status: 'loading' })

export function useSession() {
  return useContext(SessionContext)
}
