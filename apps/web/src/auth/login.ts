import { supabase } from './supabase'

// Google の画面へ移る。戻り先は /auth/callback（Supabase の Redirect URLs に登録してある）
// 移れなかったら false を返す
export async function signInWithGoogle(): Promise<boolean> {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    return !error
  } catch {
    return false
  }
}
