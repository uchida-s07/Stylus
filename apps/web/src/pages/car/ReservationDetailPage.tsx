import { CAR_MESSAGES, reservationPhase, type ReservationDetail } from '@stylus/shared'
import { Alert, Anchor, Badge, Button, Container, Group, Stack, Text, Title } from '@mantine/core'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../../api/client'
import { callApi, WRITE_MESSAGES } from '../../api/responses'
import { useLeaveAsUnregistered } from '../../auth/unregistered'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ErrorScreen } from '../../components/ErrorScreen'
import { Loading } from '../../components/Loading'
import { NoticeScreen } from '../../components/NoticeScreen'
import { useApiLoad } from '../../components/useApiLoad'
import { periodLabel } from './format'

// 予約の中身（CAR-F-005〜007）：車・予約した家族・日時・行き先・メモ
// 本人で、まだ始まっていなければ「直す」「取り消す」、使用中なら「直す」だけ、終わっていれば何も出さない
// （見た目だけ。判定は API が行う。状態は端末の時計で求める）
export function ReservationDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const leaveAsUnregistered = useLeaveAsUnregistered()
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<string>()
  const { state, reload } = useApiLoad(() =>
    callApi(() => api['car-reservations'][':id'].$get({ param: { id } })),
  )

  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'error') {
    if (state.code === 'not_found') {
      return (
        <NoticeScreen
          title="予約"
          message={CAR_MESSAGES.reservationNotFound}
          backTo="/car"
          backLabel="車へ"
        />
      )
    }
    return <ErrorScreen kind={state.error} />
  }
  const r = state.data
  const phase = reservationPhase(r.startsAt, r.endsAt, new Date())
  const canEdit = r.isMine && phase !== 'ended'
  const canCancel = r.isMine && phase === 'not_started'

  async function cancel() {
    const result = await callApi(() => api['car-reservations'][':id'].$delete({ param: { id } }))
    setConfirming(false)
    if (result.kind === 'ok') return void navigate('/car')
    if (result.kind === 'unregistered') return leaveAsUnregistered()
    if (result.kind === 'network') return setNotice(WRITE_MESSAGES.network)
    const code = result.error?.code
    if (code === 'not_found') return setNotice(CAR_MESSAGES.reservationNotFound)
    if (code === 'state_changed') {
      // 確認を開いている間に始まった。最新を出す
      setNotice(CAR_MESSAGES.cancelStarted)
      return reload()
    }
    setNotice(WRITE_MESSAGES.failed)
  }

  return (
    <Container component="main" aria-label="予約" py="md" size="xs">
      <Stack>
        <Group justify="space-between">
          <Title order={1}>予約</Title>
          <Anchor component={Link} to="/car">
            車へ
          </Anchor>
        </Group>
        {notice && <Alert color="red">{notice}</Alert>}
        <Details reservation={r} />
        {(canEdit || canCancel) && (
          <Group grow>
            {canEdit && (
              <Button component={Link} to={`/car/reservations/${r.id}/edit`}>
                直す
              </Button>
            )}
            {canCancel && (
              <Button color="red" variant="light" onClick={() => setConfirming(true)}>
                取り消す
              </Button>
            )}
          </Group>
        )}
      </Stack>
      <ConfirmDialog
        opened={confirming}
        title="この予約を取り消しますか？"
        confirmLabel="取り消す"
        color="red"
        onClose={() => setConfirming(false)}
        onConfirm={cancel}
      />
    </Container>
  )
}

function Details({ reservation: r }: { reservation: ReservationDetail }) {
  return (
    <Stack gap="sm">
      <Item label="車">
        <Group gap="xs">
          <Text>{r.car.name}</Text>
          {!r.car.isActive && (
            <Badge variant="light" color="gray">
              使わない
            </Badge>
          )}
        </Group>
      </Item>
      <Item label="予約した人">
        <Text>{r.member.displayName}</Text>
      </Item>
      <Item label="日時">
        <Text>{periodLabel(r.startsAt, r.endsAt)}</Text>
      </Item>
      <Item label="行き先">
        <Text>{r.destination ?? 'なし'}</Text>
      </Item>
      <Item label="メモ">
        <Text style={{ whiteSpace: 'pre-wrap' }}>{r.memo ?? 'なし'}</Text>
      </Item>
    </Stack>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={2}>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      {children}
    </Stack>
  )
}
