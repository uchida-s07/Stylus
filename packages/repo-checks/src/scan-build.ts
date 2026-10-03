// ビルド成果物に秘密情報の形が無いかを調べる（COMMON-N-004。CI でフロントのビルドの後に使う）
// 使い方：node packages/repo-checks/src/scan-build.ts <ビルドの出力ディレクトリ>
// Node の型の取り除きでそのまま動かすため、import には拡張子 .ts を付ける
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { findSecretValues } from './secret-patterns.ts'

// ディレクトリの中のすべてのファイルを調べ、秘密情報の値の形があれば「ファイル: 形」の一覧を返す
// ライブラリが形の文字列そのものを含むので、追跡ファイルの検査（文字列の形）と違い、値の形で探す
export function scanBuildOutput(dir: string): string[] {
  const files = readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
  return files.flatMap((entry) => {
    const path = join(entry.parentPath, entry.name)
    const name = relative(dir, path).split(sep).join('/')
    // 形はすべて ASCII なので、バイナリも 1 バイト 1 文字で読んで探せる
    return findSecretValues(readFileSync(path, 'latin1')).map((pattern) => `${name}: ${pattern}`)
  })
}

if (import.meta.main) {
  const dir = process.argv[2]
  if (!dir) {
    console.error('使い方: node packages/repo-checks/src/scan-build.ts <ビルドの出力ディレクトリ>')
    process.exit(2)
  }
  const found = scanBuildOutput(dir)
  if (found.length > 0) {
    console.error(`ビルド成果物に秘密情報の形が見つかった（COMMON-N-004）:\n${found.join('\n')}`)
    process.exit(1)
  }
  console.log(`ビルド成果物に秘密情報の形は無い: ${dir}`)
}
