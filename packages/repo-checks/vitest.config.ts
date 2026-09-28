import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'repo-checks',
    environment: 'node',
    // ESLint の初回の読み込み（import-boundary.test.ts）が重く、負荷が高いと既定の5秒を超えることがあるので、制限時間を延ばす
    testTimeout: 30_000,
  },
})
