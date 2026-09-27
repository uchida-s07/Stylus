import type { MeResponse } from '@stylus/shared'
import { Container, Stack, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import { api, NetworkError } from '../api/client'
import { useLeaveAsUnregistered } from '../auth/unregistered'
import { ErrorScreen, type ErrorKind } from '../components/ErrorScreen'
import { Loading } from '../components/Loading'

type HomeState =
  { kind: 'loading' } | { kind: 'ready'; me: MeResponse } | { kind: 'error'; error: ErrorKind }

// アプリのホーム（AUTH-F-002、AUTH-F-004）。自分の表示名を API から取って出す
// 家族として登録されていなければ（403）ログイン画面へ。通信できない・読み込めないときは知らせる（端末のセッションは消さない）
export function HomePage() {
  const [state, setState] = useState<HomeState>({ kind: 'loading' })
  const leaveAsUnregistered = useLeaveAsUnregistered()

  useEffect(() => {
    let active = true
    void (async () => {
      const next = await loadMe()
      if (!active) return
      if (next === 'unregistered') return void leaveAsUnregistered()
      setState(next)
    })()
    return () => {
      active = false
    }
  }, [leaveAsUnregistered])

  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'error') return <ErrorScreen kind={state.error} />
  return (
    <Container component="main" aria-label="ホーム" py="xl">
      <Stack>
        <Title order={1}>Stylus</Title>
        <Text size="xl">{state.me.displayName}</Text>
      </Stack>
    </Container>
  )
}

async function loadMe(): Promise<HomeState | 'unregistered'> {
  try {
    const res = await api.me.$get()
    if (res.status === 403) return 'unregistered'
    if (!res.ok) return { kind: 'error', error: 'loadFailed' }
    return { kind: 'ready', me: await res.json() }
  } catch (error) {
    return { kind: 'error', error: error instanceof NetworkError ? 'network' : 'loadFailed' }
  }
}
