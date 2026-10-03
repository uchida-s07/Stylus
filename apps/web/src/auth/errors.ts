// ログイン画面に出すメッセージ（AUTH-F-002）
export type LoginNotice = 'unregistered' | 'failed'

export const LOGIN_NOTICE_MESSAGES: Record<LoginNotice, string> = {
  unregistered: 'この Google アカウントは登録されていません。管理者に連絡してください。',
  failed: 'ログインできませんでした。時間をおいてもう一度お試しください。',
}

// 次にログイン画面を開いたときに出すメッセージ。メモリにだけ置くので、アプリを開き直したら消える（AUTH-F-002/AC-6）
// ルーターの移動に載せないのは、セッションを消したときにログイン画面へ送る見張り（RequireSignedIn）と競合するため
let pendingNotice: LoginNotice | undefined

export function setLoginNotice(notice: LoginNotice | undefined) {
  pendingNotice = notice
}

export function peekLoginNotice() {
  return pendingNotice
}

export type CallbackResult =
  { kind: 'code'; code: string } | { kind: 'cancelled' } | { kind: 'error'; notice: LoginNotice }

// Google（Supabase）から戻ってきた URL を読み分ける。エラーは ? の後ろにも # の後ろにも付きうる
// - error_code=signup_disabled：サインアップ無効で弾かれた＝登録されていない
// - error=access_denied（ほかの理由の error_code が無い）：Google の画面でキャンセルした
// - それ以外のエラー、コードもエラーも無い：失敗
// 弾かれたときも error=access_denied が付きうるので、error_code を先に見る
export function readCallback(search: string, hash: string): CallbackResult {
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(hash.replace(/^#/, ''))
  const get = (name: string) => query.get(name) ?? fragment.get(name)

  const error = get('error')
  const errorCode = get('error_code')
  if (errorCode === 'signup_disabled') return { kind: 'error', notice: 'unregistered' }
  if (error === 'access_denied' && !errorCode) return { kind: 'cancelled' }
  if (error || errorCode) return { kind: 'error', notice: 'failed' }

  const code = query.get('code')
  return code ? { kind: 'code', code } : { kind: 'error', notice: 'failed' }
}
