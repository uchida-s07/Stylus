import { toJstDate } from '@stylus/shared'
import { Anchor, Container, Group, Stack, Title } from '@mantine/core'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../../api/client'
import { callApi } from '../../api/responses'
import { ErrorScreen } from '../../components/ErrorScreen'
import { Loading } from '../../components/Loading'
import { useApiLoad } from '../../components/useApiLoad'
import { NoCars } from './NoCars'
import { ReservationForm } from './ReservationForm'
import { useCreateReservation } from './useCreateReservation'

// 予約の入力（CAR-F-004）。車の選択肢は「使う」の車だけ（1台だけなら最初から選ぶ）
export function ReservationNewPage() {
  const navigate = useNavigate()
  // 入力を開いたときに作り、送り直しでも同じ値を送る（二重登録の防止）
  const [requestId] = useState(() => crypto.randomUUID())
  // 予約の開始の日を選んだ車の画面へ戻る（CAR-F-004）
  const send = useCreateReservation(
    requestId,
    (r) => void navigate(`/car?date=${toJstDate(new Date(r.startsAt))}`),
  )
  const { state } = useApiLoad(() => callApi(() => api.cars.$get()))

  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'error') return <ErrorScreen kind={state.error} />
  const activeCars = state.data.cars.filter((c) => c.isActive)

  return (
    <Container component="main" aria-label="予約する" py="md" size="xs">
      <Stack>
        <Group justify="space-between">
          <Title order={1}>予約する</Title>
          <Anchor component={Link} to="/car">
            車へ
          </Anchor>
        </Group>
        {activeCars.length === 0 ? (
          <NoCars message="先に車を登録してください" />
        ) : (
          <ReservationForm
            initial={{
              carId: activeCars.length === 1 ? activeCars[0]!.id : '',
              startDate: '',
              startTime: '',
              endDate: '',
              endTime: '',
              destination: '',
              memo: '',
            }}
            carOptions={activeCars.map((c) => ({ value: c.id, label: c.name }))}
            carAndStartEditable
            submitLabel="予約する"
            send={send}
          />
        )}
      </Stack>
    </Container>
  )
}
