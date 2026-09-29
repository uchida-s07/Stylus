import { ESLint } from 'eslint'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(import.meta.dirname, '..', '..', '..')
const RULE = 'stylus/no-api-runtime-import'

// リポジトリの eslint.config.js（pnpm lint と同じ設定）で、apps/web の中のファイルとしてコードを検査する
const eslint = new ESLint({ cwd: repoRoot })

async function lintWeb(code: string, file = 'apps/web/src/pages/Example.tsx') {
  const [result] = await eslint.lintText(code, { filePath: join(repoRoot, file) })
  return result!.messages
}

async function boundaryErrors(code: string, file?: string) {
  return (await lintWeb(code, file)).filter((m) => m.ruleId === RULE)
}

describe('apps/web から apps/api の実行コードを import しない（COMMON-N-010）', () => {
  it.each([
    ['相対パス', "import { createApp } from '../../../api/src/app'\nexport const x = createApp\n"],
    ['パッケージ名', "import { createApp } from 'api/src/app'\nexport const x = createApp\n"],
  ])(
    '[COMMON-N-010/AC-1] apps/api の実行コードを import する行（%s）はエラーになる',
    async (_label, code) => {
      const errors = await boundaryErrors(code)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatchObject({ line: 1, severity: 2 })
    },
  )

  it.each([
    [
      '相対パス',
      "import type { AppType } from '../../../api/src/app'\nexport type Api = AppType\n",
    ],
    ['パッケージ名', "import type { AppType } from 'api/src/app'\nexport type Api = AppType\n"],
  ])(
    '[COMMON-N-010/AC-2] apps/api からの import type の行（%s）はエラーにならない',
    async (_label, code) => {
      expect(await lintWeb(code)).toEqual([])
    },
  )

  // AC ではない確認：抜け道と、誤って止めないこと
  it.each([
    ['中身を読み込むだけの import', "import '../../../api/src/app'\n"],
    [
      '型の印を名前にだけ付けた import（verbatimModuleSyntax では読み込みが残る）',
      "import { type AppType } from '../../../api/src/app'\nexport type Api = AppType\n",
    ],
    ['再 export', "export { createApp } from '../../../api/src/app'\n"],
    ['まとめての再 export', "export * from 'api/src/app'\n"],
    ['動的 import', "export const load = () => import('../../../api/src/app')\n"],
    ['パッケージのルート', "import api from 'api'\nexport const x = api\n"],
  ])('%s はエラーになる', async (_label, code) => {
    expect(await boundaryErrors(code)).toHaveLength(1)
  })

  it.each([
    ['型だけの再 export', "export type { AppType } from '../../../api/src/app'\n"],
    ['import() の型', "export type Api = typeof import('../../../api/src/app')\n"],
    [
      'apps/web の中の api フォルダ',
      "import { client } from '../api/client'\nexport const x = client\n",
    ],
    ['名前が api で始まる別のパッケージ', "import { x } from 'api-client'\nexport const y = x\n"],
    ['共有パッケージ', "import { toJstDate } from '@stylus/shared'\nexport const x = toJstDate\n"],
  ])('%s はエラーにならない', async (_label, code) => {
    expect(await boundaryErrors(code)).toEqual([])
  })

  it('apps/api の中では、このルールは働かない', async () => {
    const code = "import { createApp } from './app'\nexport const x = createApp\n"
    expect(await boundaryErrors(code, 'apps/api/src/example.ts')).toEqual([])
  })
})
