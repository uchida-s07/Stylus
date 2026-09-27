import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'repo-checks',
    environment: 'node',
  },
})
