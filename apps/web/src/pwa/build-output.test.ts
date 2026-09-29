// @vitest-environment node
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const WEB_ROOT = resolve(import.meta.dirname, '../..')

// 出力ディレクトリの中のファイルを、出力ディレクトリからの相対パス（/ 区切り）で並べる
async function listFiles(dir: string, root = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((e) =>
      e.isDirectory()
        ? listFiles(join(dir, e.name), root)
        : [relative(root, join(dir, e.name)).split(sep).join('/')],
    ),
  )
  return nested.flat()
}

type Manifest = {
  name?: string
  display?: string
  start_url?: string
  icons?: { src: string; sizes: string; type?: string }[]
}

// 本番用のビルドを一時ディレクトリに出して調べる（APP-F-001）
describe('PWA のビルド結果（APP-F-001）', () => {
  let outDir: string
  let files: string[]

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'stylus-web-build-'))
    // テストの中は NODE_ENV=test。Service Worker を作る Workbox はこれを見て形を変えるので、本番と同じにしてビルドする
    const nodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await build({
        root: WEB_ROOT,
        configFile: join(WEB_ROOT, 'vite.config.ts'),
        mode: 'production',
        logLevel: 'silent',
        build: { outDir, emptyOutDir: true },
      })
    } finally {
      process.env.NODE_ENV = nodeEnv
    }
    files = await listFiles(outDir)
  }, 120_000)

  afterAll(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true })
  })

  it('[APP-F-001/AC-1] 出力された Web アプリマニフェストは、名前が「Stylus」、表示モードが standalone、start_url がアプリのホームで、192px と 512px のアイコンが入っている', async () => {
    const manifestPath = files.find((f) => f.endsWith('.webmanifest'))
    expect(manifestPath).toBeDefined()
    const manifest = JSON.parse(await readFile(join(outDir, manifestPath!), 'utf8')) as Manifest

    expect(manifest.name).toBe('Stylus')
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    for (const size of ['192x192', '512x512']) {
      const icon = manifest.icons?.find((i) => i.sizes === size)
      expect(icon, `${size} のアイコン`).toBeDefined()
      expect(icon!.type).toBe('image/png')
      // アイコンの画像がビルド結果に入っている
      expect(existsSync(join(outDir, icon!.src.replace(/^\//, ''))), icon!.src).toBe(true)
    }
    // 画面からマニフェストを読ませている
    const html = await readFile(join(outDir, 'index.html'), 'utf8')
    expect(html).toContain(`rel="manifest" href="/${manifestPath}"`)
  })

  it('[APP-F-001/AC-2] 出力されたファイルに Service Worker があり、アプリの画面（HTML・JS・CSS）を端末に保存する対象にしている', async () => {
    expect(files).toContain('sw.js')
    const sw = await readFile(join(outDir, 'sw.js'), 'utf8')

    const screens = files.filter((f) => /^(index\.html|assets\/.+\.(js|css))$/.test(f))
    expect(screens.some((f) => f.endsWith('.js'))).toBe(true)
    expect(screens.some((f) => f.endsWith('.css'))).toBe(true)
    for (const file of screens) {
      // 保存の対象の一覧（precacheAndRoute）に {url:"<ファイル>",revision:…} の形で入る
      expect(sw, `${file} を保存の対象にしている`).toContain(`url:"${file}"`)
    }
    // 画面が Service Worker を登録する
    const html = await readFile(join(outDir, 'index.html'), 'utf8')
    const registers = html.includes('registerSW.js') || html.includes('serviceWorker.register')
    expect(registers).toBe(true)
  })
})
