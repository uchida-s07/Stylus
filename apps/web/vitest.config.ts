import { defineProject, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineProject({
    test: {
      name: 'web',
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      env: { VITE_API_URL: 'https://api.test' },
      unstubGlobals: true,
    },
  }),
)
