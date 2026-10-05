import { apiErrorSchema, type ApiError } from '@stylus/shared'
import { NetworkError } from './client'

// API の応答の見分け（画面が共通で使う）
// - ok：成功。data に本文
// - unregistered：403 not_a_member（家族の登録から外された）。端末のセッションを消してログイン画面へ
// - network：通信できなかった
// - failed：それ以外の失敗。status と、本文が API のエラーの形なら error（code・message・fields）
// 403 forbidden は未登録ではなく、ほかの失敗と同じに扱う（architecture.md の規約）
export type ApiResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'unregistered' }
  | { kind: 'network' }
  | { kind: 'failed'; status: number; error?: ApiError['error'] }

type ResponseLike<T> = { ok: boolean; status: number; json(): Promise<T> }

export async function callApi<T>(request: () => Promise<ResponseLike<T>>): Promise<ApiResult<T>> {
  let res: ResponseLike<T>
  try {
    res = await request()
  } catch (error) {
    if (error instanceof NetworkError) return { kind: 'network' }
    throw error
  }
  if (res.ok) return { kind: 'ok', data: await res.json() }

  const body = apiErrorSchema.safeParse(await res.json().catch(() => undefined))
  const error = body.success ? body.data.error : undefined
  if (res.status === 403 && error?.code === 'not_a_member') return { kind: 'unregistered' }
  return { kind: 'failed', status: res.status, ...(error && { error }) }
}

// 読み込みの失敗の知らせ（ErrorScreen の種類）
export function loadErrorOf(result: { kind: 'network' | 'failed' }) {
  return result.kind === 'network' ? ('network' as const) : ('loadFailed' as const)
}

// 書き込みの失敗の知らせ（spec 002「この領域で共通の振る舞い」）
export const WRITE_MESSAGES = {
  network: '通信できません。電波の良いところでもう一度お試しください。',
  failed: '保存できませんでした。時間をおいてもう一度お試しください。',
} as const
