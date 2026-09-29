import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findSecretPatterns, SECRET_PATTERNS, SECRET_PATTERNS_FILE } from './secret-patterns'

const repoRoot = join(import.meta.dirname, '..', '..', '..')

// git で追跡しているファイル（docs/ と、形を定義したファイル自身を除く）
function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((file) => !file.startsWith('docs/') && file !== SECRET_PATTERNS_FILE)
}

describe('秘密情報をリポジトリに置かない（COMMON-N-004）', () => {
  it('[COMMON-N-004/AC-1] git で追跡しているファイルに、秘密情報の形が1件も無い', () => {
    const files = trackedFiles()
    // 調べる対象が空で素通りしないように
    expect(files).toContain('package.json')

    const found = files.flatMap((file) => {
      const path = join(repoRoot, file)
      // 削除したがまだコミットしていないファイルは飛ばす
      if (!existsSync(path)) return []
      // 形はすべて ASCII なので、バイナリも 1 バイト 1 文字で読んで探せる
      return findSecretPatterns(readFileSync(path, 'latin1')).map(
        (pattern) => `${file}: ${pattern}`,
      )
    })
    expect(found).toEqual([])
  })

  // AC ではない確認：形の見つけ方
  it.each(SECRET_PATTERNS.map((pattern) => [pattern]))('%s を含む文字列から見つける', (pattern) => {
    expect(findSecretPatterns(`value=${pattern}xxxx`)).toEqual([pattern])
  })

  // 形をこのファイルにじかに書くと AC-1 の検査に引っかかるので、定義から組み立てる
  it('大文字・小文字を区別せずに見つける', () => {
    const pattern = SECRET_PATTERNS[2]
    expect(findSecretPatterns(`URL=${pattern.toUpperCase()}host/db`)).toEqual([pattern])
  })

  it('形が無ければ何も返さない', () => {
    expect(findSecretPatterns('SUPABASE_URL=https://example.supabase.co')).toEqual([])
  })
})
