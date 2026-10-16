import type { Reservation } from '@stylus/shared'
import { Drawer, Modal } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { ReservationForm } from './ReservationForm'
import type { ReservationFormValues } from './reservationFormValues'
import { useCreateReservation } from './useCreateReservation'

// 時間割で範囲を選んだときに出る予約の入力（CAR-F-004）
// 幅 768px 以上は画面の中央のポップアップ、768px 未満は画面の下から出るシート。中身は予約の入力の画面と同じフォーム
// 開くたびに作り直す（呼ぶ側が key を変える）ので、requestId も開くたびに変わる
export function ReservationDialog({
  initial,
  carOptions,
  requestId,
  onClose,
  onCreated,
}: {
  initial: ReservationFormValues
  carOptions: { value: string; label: string }[]
  requestId: string
  onClose: () => void
  onCreated: (reservation: Reservation) => void
}) {
  const wide = useMediaQuery('(min-width: 768px)')
  const send = useCreateReservation(requestId, onCreated)
  const form = (
    <ReservationForm
      initial={initial}
      carOptions={carOptions}
      carAndStartEditable
      submitLabel="予約する"
      send={send}
    />
  )
  return wide ? (
    <Modal opened onClose={onClose} title="予約する" centered>
      {form}
    </Modal>
  ) : (
    <Drawer opened onClose={onClose} title="予約する" position="bottom" size="auto">
      {form}
    </Drawer>
  )
}
