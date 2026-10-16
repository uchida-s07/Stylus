import {
  createReservationInputSchema,
  type Reservation,
  type ReservationInput,
} from '@stylus/shared'
import { api } from '../../api/client'
import { callApi } from '../../api/responses'
import { useLeaveAsUnregistered } from '../../auth/unregistered'
import {
  issuesToFields,
  reservationWriteFailure,
  toFieldErrors,
  toIso,
  type ReservationFormValues,
  type ReservationSendResult,
} from './reservationFormValues'

// 予約を入れる処理（CAR-F-004）。予約の入力の画面と、時間割から出る入力で共用する
// requestId は入力を開いたときに作り、送り直しでも同じ値を送る（二重登録の防止）
export function useCreateReservation(
  requestId: string,
  onCreated: (reservation: Reservation) => void,
) {
  const leaveAsUnregistered = useLeaveAsUnregistered()

  return async function send(values: ReservationFormValues): Promise<ReservationSendResult> {
    // 空の欄は送らず、スキーマで「入力してください」にする
    const body = {
      carId: values.carId || undefined,
      startsAt: toIso(values.startDate, values.startTime),
      endsAt: toIso(values.endDate, values.endTime),
      destination: values.destination,
      memo: values.memo,
      requestId,
    }
    // 「終了の日時が過ぎています」の最後の判定は API が行う（画面の時計は補助）
    const parsed = createReservationInputSchema(new Date()).safeParse(body)
    if (!parsed.success) {
      return { kind: 'fieldErrors', errors: toFieldErrors(issuesToFields(parsed.error), values) }
    }
    const json = body as ReservationInput
    const result = await callApi(() => api['car-reservations'].$post({ json }))
    if (result.kind === 'ok') {
      onCreated(result.data)
      return { kind: 'ok' }
    }
    if (result.kind === 'unregistered') {
      await leaveAsUnregistered()
      return { kind: 'ok' }
    }
    return reservationWriteFailure(result, values)
  }
}
