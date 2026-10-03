import { defineConfig } from 'drizzle-kit'

// マイグレーションを流す先は環境変数 DATABASE_URL で渡す（GitHub Actions の Environments の secret）
// generate（SQL を作るだけ）には接続は要らない
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
})
