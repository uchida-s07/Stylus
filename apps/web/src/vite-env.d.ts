/// <reference types="vite/client" />

// Pages の環境変数（本番・プレビュー別）とローカルの .env.local から渡す。どれも公開してよい値
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  readonly VITE_API_URL: string
  readonly VITE_SENTRY_DSN: string
  // ビルドのときにブランチ名から決める（vite.config.ts の define。src/sentry/environment.ts）
  readonly SENTRY_ENVIRONMENT: 'production' | 'development'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
