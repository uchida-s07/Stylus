import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import noApiRuntimeImport from './packages/repo-checks/eslint/no-api-runtime-import.js'

export default defineConfig([
  globalIgnores(['**/node_modules/', '**/dist/', '**/coverage/', '**/.wrangler/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    // apps/web から apps/api の実行コードを import しない（import type だけ許す。COMMON-N-010）
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { stylus: { rules: { 'no-api-runtime-import': noApiRuntimeImport } } },
    rules: { 'stylus/no-api-runtime-import': 'error' },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['**/*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  prettier,
])
