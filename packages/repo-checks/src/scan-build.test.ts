import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanBuildOutput } from './scan-build'
import { SECRET_PATTERNS } from './secret-patterns'

// 形をこのファイルにじかに書くと、追跡ファイルの検査に引っかかるので、定義から組み立てる
const [SECRET_KEY, POSTGRES, POSTGRESQL] = SECRET_PATTERNS

// ビルド成果物の検査（COMMON-N-004 の測り方の「CI でビルド成果物を調べる」）
describe('scanBuildOutput', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'stylus-scan-build-'))
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Stylus</title>')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const scanJs = (code: string) => {
    writeFileSync(join(dir, 'assets', 'index.js'), code)
    return scanBuildOutput(dir)
  }

  it('値の形が無ければ何も返さない', () => {
    expect(scanJs('const url = "https://example.supabase.co"')).toEqual([])
  })

  it('サービスロールキーの値を、ファイルの場所つきで見つける', () => {
    expect(scanJs(`const key = "${SECRET_KEY}AbCdEf0123456789_xyz"`)).toEqual([
      `assets/index.js: ${SECRET_KEY}`,
    ])
  })

  it.each([[POSTGRES], [POSTGRESQL]])('パスワード入りの接続文字列（%s）を見つける', (scheme) => {
    expect(scanJs(`const db = "${scheme}app:p4ss@db.example.com:5432/app"`)).toEqual([
      `assets/index.js: ${scheme}`,
    ])
  })

  // supabase-js はキーの種類を見分けるために形の文字列そのものを持つ（本物のキーではない）
  it('ライブラリが形の文字列だけを持つときは見つけない', () => {
    expect(scanJs(`const isNewApiKey = (k) => k.startsWith(\`${SECRET_KEY}\`)`)).toEqual([])
    expect(scanJs(`const hint = "${POSTGRESQL}host/db"`)).toEqual([])
  })
})
