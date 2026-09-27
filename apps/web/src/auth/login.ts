import { supabase } from './supabase'

// Google の画面へ移る。戻り先は /auth/callback（Supabase の Redirect URLs に登録してある）
export async function signInWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
}
