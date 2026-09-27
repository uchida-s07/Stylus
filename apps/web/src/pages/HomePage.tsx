import type { MeResponse } from '@stylus/shared'
import { Container, Stack, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useLeaveAsUnregistered } from '../auth/unregistered'
import { Loading } from '../components/Loading'

// アプリのホーム（AUTH-F-002、AUTH-F-004）。自分の表示名を API から取って出す
// 家族として登録されていなければ（403）ログイン画面へ。読み込みの失敗・通信できないときの表示は T-18
export function HomePage() {
  const [me, setMe] = useState<MeResponse>()
  const leaveAsUnregistered = useLeaveAsUnregistered()

  useEffect(() => {
    let active = true
    void (async () => {
      const res = await api.me.$get()
      if (!active) return
      if (res.status === 403) return void leaveAsUnregistered()
      if (res.ok) setMe(await res.json())
    })()
    return () => {
      active = false
    }
  }, [leaveAsUnregistered])

  if (!me) return <Loading />
  return (
    <Container component="main" aria-label="ホーム" py="xl">
      <Stack>
        <Title order={1}>Stylus</Title>
        <Text size="xl">{me.displayName}</Text>
      </Stack>
    </Container>
  )
}
