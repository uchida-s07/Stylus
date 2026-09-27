import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // 端末のホーム画面に追加して、アプリとして開ける（APP-F-001）
    VitePWA({
      // 新しい版の Service Worker は、使っている最中には切り替えず、次に開いたときに使う（入力中の内容が消えないように）
      // prompt のまま切り替えを促す画面を作らないので、開いている画面がすべて閉じてから切り替わる
      registerType: 'prompt',
      manifest: {
        name: 'Stylus',
        short_name: 'Stylus',
        lang: 'ja',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#228be6',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          // 文字は中央の安全な範囲に収めてあるので、端末の形に切り抜かれても欠けない
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // 保存の対象は既定のまま：画面の HTML・JS・CSS と、マニフェストとそのアイコン
      // 通信できないときも保存済みの画面を出す。API や Supabase への要求は保存しない（どちらも別のオリジン）
    }),
  ],
  server: {
    // CORS で許可する開発用の localhost と揃える
    port: 5173,
    strictPort: true,
  },
})
