import { AUTH_STORAGE_KEY } from './storage-key'
import { supabase } from './supabase'

// この端末のログイン状態を消す（AUTH-F-004）。ほかの端末のログイン状態は取り消さない（scope: 'local'）
// セッションが消えると、見張り（RequireSignedIn）がログイン画面へ送る
// supabase-js は、期限切れのトークンを通信できずに更新できなかったときなどに、端末のセッションを消さずにエラーを返す。
// そのときは保存領域から自分で消し、もう一度呼んで（消えたセッションには通信しない）ログアウトを知らせてもらう
export async function signOutLocally() {
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (!error) return
  } catch {
    // 下で消す
  }
  localStorage.removeItem(AUTH_STORAGE_KEY)
  localStorage.removeItem(`${AUTH_STORAGE_KEY}-user`)
  await supabase.auth.signOut({ scope: 'local' })
}
