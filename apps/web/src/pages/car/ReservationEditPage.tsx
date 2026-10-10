import {
  CAR_MESSAGES,
  createReservationEditSchema,
  reservationPhase,
  type ReservationDetail,
  type ReservationEditInput,
} from '@stylus/shared'
import { Alert, Anchor, Container, Group, Stack, Title } from '@mantine/core'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../../api/client'
import { callApi } from '../../api/responses'
import { useLeaveAsUnregistered } from '../../auth/unregistered'
import { ErrorScreen } from '../../components/ErrorScreen'
import { Loading } from '../../components/Loading'
import { NoticeScreen } from '../../components/NoticeScreen'
import { combineResults, useApiLoad } from '../../components/useApiLoad'
import { ReservationForm } from './ReservationForm'
import {
  issuesToFields,
  reservationWriteFailure,
  toDateTimeFields,
  toFieldErrors,
  toIso,
  type ReservationFormValues,
  type ReservationSendResult,
} from './reservationFormValues'

const TITLE = '予約を直す'

// 予約を直す（CAR-F-006）
// まだ始まっていない予約は全項目、使用中の予約は終了・行き先・メモだけ（車・開始日時の欄を出さず、送らない）
// 車の選択肢は「使う」の車と、今の車（「使わない」でも。車を変えずに直せるように）
export function ReservationEditPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const leaveAsUnregistered = useLeaveAsUnregistered()
  // 開いた後に変わっていたときの知らせ（最新を出し直した上に出す）
  const [notice, setNotice] = useState<string>()
  // 保存しようとしたら予約が取り消されていた
  const [gone, setGone] = useState(false)
  const loadDetail = () => callApi(() => api['car-reservations'][':id'].$get({ param: { id } }))
  const { state, reload } = useApiLoad(async () =>
    combineResults([await loadDetail(), await callApi(() => api.cars.$get())]),
  )

  const notFound = (
    <NoticeScreen
      title={TITLE}
      message={CAR_MESSAGES.reservationNotFound}
      backTo="/car"
      backLabel="車へ"
    />
  )
  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'error') {
    return state.code === 'not_found' ? notFound : <ErrorScreen kind={state.error} />
  }
  if (gone) return notFound
  const [r, { cars }] = state.data
  const phase = reservationPhase(r.startsAt, r.endsAt, new Date())
  if (!r.isMine || phase === 'ended') {
    const message = r.isMine ? CAR_MESSAGES.ended : CAR_MESSAGES.forbidden
    return <NoticeScreen title={TITLE} message={message} backTo="/car" backLabel="車へ" />
  }
  const notStarted = phase === 'not_started'
  const carOptions = cars
    .filter((c) => c.isActive || c.id === r.car.id)
    .map((c) => ({ value: c.id, label: c.isActive ? c.name : `${c.name}（使わない）` }))

  async function send(values: ReservationFormValues): Promise<ReservationSendResult> {
    // 全項目と版を毎回送る（tasks.md D-4）。使用中の予約の直し方は車・開始日時を送らない
    const common = {
      endsAt: toIso(values.endDate, values.endTime),
      destination: values.destination,
      memo: values.memo,
      version: r.version,
    }
    const body = notStarted
      ? {
          carId: values.carId || undefined,
          startsAt: toIso(values.startDate, values.startTime),
          ...common,
        }
      : common
    const parsed = createReservationEditSchema(new Date()).safeParse(body)
    if (!parsed.success) {
      return { kind: 'fieldErrors', errors: toFieldErrors(issuesToFields(parsed.error), values) }
    }
    // 使用中の予約の直し方は、開始日時と比べる（tasks.md D-2）
    if (!notStarted && common.endsAt! <= r.startsAt) {
      return { kind: 'fieldErrors', errors: { endTime: CAR_MESSAGES.endNotAfterStart } }
    }
    const json = body as ReservationEditInput
    const result = await callApi(() =>
      api['car-reservations'][':id'].$patch({ param: { id }, json }),
    )
    if (result.kind === 'ok') {
      void navigate('/car')
      return { kind: 'ok' }
    }
    if (result.kind === 'unregistered') {
      await leaveAsUnregistered()
      return { kind: 'ok' }
    }
    if (result.kind === 'failed' && result.error?.code === 'not_found') {
      setGone(true)
      return { kind: 'ok' }
    }
    if (result.kind === 'failed' && result.error?.code === 'state_changed') {
      await showLatest(r, notStarted)
      return { kind: 'ok' }
    }
    return reservationWriteFailure(result, values)
  }

  // 409 を受けたら取り直し、見ていたときと比べて「始まっていた」「終わっていた」「中身が変わっていた」で
  // 知らせを出し分け、最新を出す
  async function showLatest(viewed: ReservationDetail, viewedNotStarted: boolean) {
    const latest = await loadDetail()
    if (latest.kind === 'failed' && latest.error?.code === 'not_found') return setGone(true)
    if (latest.kind === 'ok') {
      const latestPhase = reservationPhase(latest.data.startsAt, latest.data.endsAt, new Date())
      if (latestPhase === 'ended') setNotice(CAR_MESSAGES.ended)
      else if (latest.data.version !== viewed.version) setNotice(CAR_MESSAGES.changed)
      else if (viewedNotStarted && latestPhase === 'in_use') setNotice(CAR_MESSAGES.started)
      else setNotice(CAR_MESSAGES.changed)
    } else {
      setNotice(CAR_MESSAGES.changed)
    }
    reload()
  }

  const start = toDateTimeFields(r.startsAt)
  const end = toDateTimeFields(r.endsAt)
  return (
    <Container component="main" aria-label={TITLE} py="md" size="xs">
      <Stack>
        <Group justify="space-between">
          <Title order={1}>{TITLE}</Title>
          <Anchor component={Link} to={`/car/reservations/${r.id}`}>
            戻る
          </Anchor>
        </Group>
        {notice && <Alert color="red">{notice}</Alert>}
        <ReservationForm
          // 最新を出し直したら、フォームも最新の値で作り直す
          key={`${r.version}-${phase}`}
          initial={{
            carId: r.car.id,
            startDate: start.date,
            startTime: start.time,
            endDate: end.date,
            endTime: end.time,
            destination: r.destination ?? '',
            memo: r.memo ?? '',
          }}
          carOptions={carOptions}
          carAndStartEditable={notStarted}
          submitLabel="保存する"
          send={send}
        />
      </Stack>
    </Container>
  )
}
