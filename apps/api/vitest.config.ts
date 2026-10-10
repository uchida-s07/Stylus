import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'api',
    environment: 'node',
    // テストごとに PGlite を作り、マイグレーションを当てる（1回に数秒かかる）。
    // 並列で走らせると既定の時間（テスト 5秒・フック 10秒）を超えることがあるので広げる
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
