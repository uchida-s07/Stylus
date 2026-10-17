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
      onCancel={onClose}
    />
  )
  // 外側を押しても閉じない（入れた内容が不意に消えないように）。✕・Esc は「キャンセル」と同じ
  const common = {
    opened: true,
    onClose,
    title: '予約する',
    closeOnClickOutside: false,
    closeButtonProps: { 'aria-label': '閉じる' },
  }
  return wide ? (
    <Modal {...common} centered>
      {form}
    </Modal>
  ) : (
    <Drawer {...common} position="bottom" size="auto">
      {form}
    </Drawer>
  )
}
