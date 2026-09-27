import { createClient } from '@supabase/supabase-js'

// フロントが supabase-js を使うのは、ログイン・ログアウト・セッションの管理だけ（データの読み書きは API を通す）
// セッションは supabase-js が端末の保存領域に持ち、アクセストークンの更新も任せる
// Google から戻ってきたコードは、戻り先の画面（/auth/callback）で自分で引き換える（URL を自動では読ませない）
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { flowType: 'pkce', detectSessionInUrl: false } },
)
