import { useCallback } from 'react'
import { setLoginNotice } from './errors'
import { supabase } from './supabase'

// API が 403 not_a_member を返したとき：この端末のセッションを消し、ログイン画面に未登録のメッセージを出す
// セッションが消えると、見張り（RequireSignedIn）がログイン画面へ送る
export function useLeaveAsUnregistered() {
  return useCallback(async () => {
    setLoginNotice('unregistered')
    await supabase.auth.signOut({ scope: 'local' })
  }, [])
}
