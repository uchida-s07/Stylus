import type { Reservation, ReservationListResponse } from '@stylus/shared'
import { Alert, Anchor, Button, Container, Group, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../api/client'
import { callApi, loadErrorOf } from '../../api/responses'
import { useLeaveAsUnregistered } from '../../auth/unregistered'
import { ErrorScreen } from '../../components/ErrorScreen'
import { Loading } from '../../components/Loading'
import { useApiLoad } from '../../components/useApiLoad'
import { ReservationRow } from './ReservationRow'

const LOAD_MESSAGES = {
  network: '通信できません。電波の良いところでもう一度開いてください。',
  loadFailed: 'うまく読み込めませんでした。時間をおいてもう一度開いてください。',
} as const

// 車の履歴（CAR-F-008）：終わった予約を新しい順（終了の遅い順）に30件ずつ。続きは「もっと見る」
export function CarHistoryPage() {
  const leaveAsUnregistered = useLeaveAsUnregistered()
  const { state } = useApiLoad(() =>
    callApi(() => api['car-reservations'].$get({ query: { view: 'past' } })),
  )
  // 「もっと見る」で読んだ続き
  const [more, setMore] = useState<ReservationListResponse[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [notice, setNotice] = useState<string>()

  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'error') return <ErrorScreen kind={state.error} />
  const pages = [state.data, ...more]
  const reservations: Reservation[] = pages.flatMap((p) => p.reservations)
  const nextCursor = pages.at(-1)!.nextCursor

  async function loadMore(before: string) {
    setLoadingMore(true)
    setNotice(undefined)
    const result = await callApi(() =>
      api['car-reservations'].$get({ query: { view: 'past', before } }),
    )
    setLoadingMore(false)
    if (result.kind === 'ok') return setMore((m) => [...m, result.data])
    if (result.kind === 'unregistered') return leaveAsUnregistered()
    setNotice(LOAD_MESSAGES[loadErrorOf(result)])
  }

  return (
    <Container component="main" aria-label="車の履歴" py="md">
      <Stack>
        <Group justify="space-between">
          <Title order={1}>履歴</Title>
          <Anchor component={Link} to="/car">
            車へ
          </Anchor>
        </Group>
        {reservations.length === 0 ? (
          <Text c="dimmed">終わった予約はありません</Text>
        ) : (
          reservations.map((r) => <ReservationRow key={r.id} reservation={r} />)
        )}
        {notice && <Alert color="red">{notice}</Alert>}
        {nextCursor && (
          <Button variant="default" loading={loadingMore} onClick={() => void loadMore(nextCursor)}>
            もっと見る
          </Button>
        )}
      </Stack>
    </Container>
  )
}
