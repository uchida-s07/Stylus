import { createClient } from '@supabase/supabase-js'

// フロントが supabase-js を使うのは、ログイン・ログアウト・セッションの管理だけ（データの読み書きは API を通す）
// セッションは supabase-js が端末の保存領域に持ち、アクセストークンの更新も任せる
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { flowType: 'pkce' } },
)
