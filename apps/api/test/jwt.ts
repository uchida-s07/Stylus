import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'

// テスト用の鍵と JWKS（本物の Supabase の JWKS の代わり）
export const TEST_ISSUER = 'https://test-project.supabase.co/auth/v1'
const KID = 'test-key'

const signingKey = await generateKeyPair('ES256', { extractable: true })
// 同じ kid を名乗る別の鍵（署名が正しくないトークンを作るため）
const forgedKey = await generateKeyPair('ES256')

export const testJwks = createLocalJWKSet({
  keys: [{ ...(await exportJWK(signingKey.publicKey)), kid: KID, alg: 'ES256', use: 'sig' }],
})

type TokenOptions = {
  sub: string
  email?: string
  // 期限（秒。負なら期限切れ）
  expiresInSec?: number
  issuer?: string
  audience?: string
  forged?: boolean
}

// Supabase のアクセストークンと同じ形の JWT を作る
export function signTestToken({
  sub,
  email = 'someone@example.com',
  expiresInSec = 3600,
  issuer = TEST_ISSUER,
  audience = 'authenticated',
  forged = false,
}: TokenOptions) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ email, role: 'authenticated', aal: 'aal1', is_anonymous: false })
    .setProtectedHeader({ alg: 'ES256', kid: KID, typ: 'JWT' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(sub)
    .setIssuedAt(now - 60)
    .setExpirationTime(now + expiresInSec)
    .sign(forged ? forgedKey.privateKey : signingKey.privateKey)
}
