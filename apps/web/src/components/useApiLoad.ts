import { useCallback, useEffect, useState } from 'react'
import { loadErrorOf, type ApiResult } from '../api/responses'
import { useLeaveAsUnregistered } from '../auth/unregistered'
import type { ErrorKind } from './ErrorScreen'

export type LoadState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'error'; error: ErrorKind; status?: number; code?: string }

// 画面を開いたときの読み込み。未登録ならログイン画面へ、失敗なら知らせの種類を返す
// reload で読み直す（409 を受けて最新を出すときなど）
export function useApiLoad<T>(load: () => Promise<ApiResult<T>>) {
  const [state, setState] = useState<LoadState<T>>({ kind: 'loading' })
  const [round, setRound] = useState(0)
  const leaveAsUnregistered = useLeaveAsUnregistered()

  useEffect(() => {
    let active = true
    void (async () => {
      const result = await load()
      if (!active) return
      if (result.kind === 'unregistered') return void leaveAsUnregistered()
      if (result.kind === 'ok') return setState({ kind: 'ready', data: result.data })
      setState({
        kind: 'error',
        error: loadErrorOf(result),
        ...(result.kind === 'failed' && { status: result.status, code: result.error?.code }),
      })
    })()
    return () => {
      active = false
    }
    // load は画面ごとに変わらない読み込み（round が変わったときだけ読み直す）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, leaveAsUnregistered])

  const reload = useCallback(() => setRound((r) => r + 1), [])
  return { state, reload }
}

// いくつかの読み込みをまとめる。どれかが失敗ならその失敗（未登録 → 通信 → それ以外の順）
export function combineResults<T extends unknown[]>(results: {
  [K in keyof T]: ApiResult<T[K]>
}): ApiResult<T> {
  const list = results as ApiResult<unknown>[]
  const unregistered = list.find((r) => r.kind === 'unregistered')
  if (unregistered) return unregistered
  const network = list.find((r) => r.kind === 'network')
  if (network) return network
  const failed = list.find((r) => r.kind === 'failed')
  if (failed) return failed
  return { kind: 'ok', data: list.map((r) => (r as { data: unknown }).data) as T }
}
