import type { MiddlewareHandler } from 'hono'
import { errors, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { AppHono } from '../env'
import { apiError } from '../errors'

// アクセストークンを検証し、Supabase Auth の利用者 ID（sub）を返す。無効なら InvalidTokenError を投げる
export type TokenVerifier = (token: string) => Promise<{ sub: string }>

export class InvalidTokenError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Supabase のアクセストークン（ES256）を JWKS の公開鍵で検証する。発行元と宛先（authenticated）も確かめる
export function createTokenVerifier(options: {
  issuer: string
  jwks: JWTVerifyGetKey
}): TokenVerifier {
  return async (token) => {
    let sub: unknown
    try {
      const { payload } = await jwtVerify(token, options.jwks, {
        issuer: options.issuer,
        audience: 'authenticated',
        algorithms: ['ES256'],
      })
      sub = payload.sub
    } catch (e) {
      // JWKS を取りに行けないなど、トークンのせいでない失敗は投げ直す（500 にする）
      if (e instanceof errors.JOSEError && !(e instanceof errors.JWKSTimeout)) {
        throw new InvalidTokenError(e.code)
      }
      throw e
    }
    if (typeof sub !== 'string' || !UUID.test(sub)) {
      throw new InvalidTokenError('sub が利用者 ID の形でない')
    }
    return { sub }
  }
}

const BEARER = /^Bearer ([^\s]+)$/i

// Authorization: Bearer のトークンを検証し、sub を c.var.authUserId に置く。無い・無効なら 401（COMMON-N-001）
export function authMiddleware(verify: TokenVerifier): MiddlewareHandler<AppHono> {
  return async (c, next) => {
    const token = BEARER.exec(c.req.header('Authorization') ?? '')?.[1]
    if (!token) {
      return c.json(apiError('unauthenticated', 'ログインが必要です'), 401)
    }
    try {
      c.set('authUserId', (await verify(token)).sub)
    } catch (e) {
      if (e instanceof InvalidTokenError) {
        return c.json(apiError('unauthenticated', 'ログインが必要です'), 401)
      }
      throw e
    }
    await next()
  }
}
