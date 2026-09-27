import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // CORS で許可する開発用の localhost と揃える
    port: 5173,
    strictPort: true,
  },
})
