import * as Sentry from '@sentry/react'
import { afterAll, describe, expect, it } from 'vitest'
import { sentryEnvironment } from './environment'
import { scrubEvent, scrubUrl, sentryOptions } from './options'

// Sentry へ送る直前の中身（envelope）を受け止める送信口
function captureTransport(sent: string[]): Sentry.BrowserOptions['transport'] {
  return (options) =>
    Sentry.createTransport(options, async (request) => {
      sent.push(
        typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body),
      )
      return { statusCode: 200 }
    })
}

describe('Sentry の environment（COMMON-N-011）', () => {
  it('Pages の本番ブランチ（main）のビルドは production', () => {
    expect(sentryEnvironment('main')).toBe('production')
  })

  it.each([['develop'], ['spec/001-foundation'], [undefined]])(
    'それ以外（%s）のビルドは development',
    (branch) => {
      expect(sentryEnvironment(branch)).toBe('development')
    },
  )
})

describe('Sentry に送る内容からログインの秘密を消す（COMMON-N-011）', () => {
  it('URL の ? と # の後ろのコード・トークンを消し、ほかはそのまま残す', () => {
    expect(scrubUrl('https://stylus-family.pages.dev/auth/callback?code=abc&next=1')).toBe(
      'https://stylus-family.pages.dev/auth/callback?code=%5BFiltered%5D&next=1',
    )
    expect(scrubUrl('/auth/callback#access_token=abc&refresh_token=def&type=x')).toBe(
      '/auth/callback#access_token=%5BFiltered%5D&refresh_token=%5BFiltered%5D&type=x',
    )
    expect(scrubUrl('https://api.test/me')).toBe('https://api.test/me')
  })

  it('要求のヘッダーの Authorization・Cookie とクッキーを消す', () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        url: 'https://stylus-family.pages.dev/',
        headers: { Authorization: 'Bearer secret-token', cookie: 'a=b', 'User-Agent': 'x' },
        cookies: { a: 'b' },
      },
    })

    expect(JSON.stringify(event)).not.toContain('secret-token')
    expect(event.request?.headers).toEqual({ 'User-Agent': 'x' })
    expect(event.request?.cookies).toBeUndefined()
  })

  describe('本物の SDK を通して実際に送る内容', () => {
    const sent: string[] = []
    Sentry.init(
      sentryOptions({
        dsn: 'https://public@o0.ingest.sentry.io/0',
        environment: 'development',
        transport: captureTransport(sent),
      }),
    )
    afterAll(() => Sentry.close())

    it('Google から戻った URL のコードや、記録に残ったトークンを送らない', async () => {
      window.history.pushState({}, '', '/auth/callback?code=secret-code')
      Sentry.addBreadcrumb({
        category: 'navigation',
        data: { from: '/login', to: '/auth/callback?code=secret-code' },
      })
      Sentry.addBreadcrumb({
        category: 'fetch',
        data: { url: 'https://api.test/x#access_token=secret-token', method: 'GET' },
      })

      Sentry.captureException(new Error('予期しないエラー'))
      await Sentry.flush(2000)

      expect(sent).toHaveLength(1)
      expect(sent[0]).toContain('予期しないエラー')
      expect(sent[0]).toContain('"environment":"development"')
      expect(sent[0]).not.toContain('secret-code')
      expect(sent[0]).not.toContain('secret-token')
    })
  })
})
