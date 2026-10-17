import { Alert, Button, Group, NativeSelect, Stack, Textarea, TextInput } from '@mantine/core'
import { useRef, useState, type FormEvent } from 'react'
import {
  oneHourLater,
  type ReservationFieldErrors,
  type ReservationFormValues,
  type ReservationSendResult,
} from './reservationFormValues'

// 予約の入力（CAR-F-004）と直す（CAR-F-006）で共用するフォーム
export function ReservationForm({
  initial,
  carOptions,
  carAndStartEditable,
  submitLabel,
  send,
  onCancel,
}: {
  initial: ReservationFormValues
  // 車の選択肢（予約の入力では「使う」の車だけ）
  carOptions: { value: string; label: string }[]
  // 車と開始日時の欄を出すか（使用中の予約を直すときは出さない）
  carAndStartEditable: boolean
  submitLabel: string
  // 入力の検証と送信。検証に通らなければ項目ごとの知らせを返す
  send: (values: ReservationFormValues) => Promise<ReservationSendResult>
  // 「キャンセル」を出すときに渡す（時間割から出た入力。入力の画面では出さない）
  onCancel?: () => void
}) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<ReservationFieldErrors>({})
  const [notice, setNotice] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  // 終了を開始の1時間後に合わせて入れるか。開いたときに終了が空なら入れ、利用者が終了を触ったらやめる
  // （時刻をキーボードで打つと途中の値でも開始が変わるので、終了を触るまでは開始に合わせ続ける）
  const [endFollowsStart, setEndFollowsStart] = useState(
    initial.endDate === '' && initial.endTime === '',
  )

  const set = (key: keyof ReservationFormValues) => (value: string) => {
    if (key === 'endDate' || key === 'endTime') setEndFollowsStart(false)
    setValues((v) => {
      const next = { ...v, [key]: value }
      // 開始を選ぶと、終了が空なら開始の1時間後を入れる（入れた後は直せる）
      if ((key === 'startDate' || key === 'startTime') && endFollowsStart) {
        const end = oneHourLater(next.startDate, next.startTime)
        if (end) return { ...next, endDate: end.date, endTime: end.time }
      }
      return next
    })
  }

  // 再描画の前に続けて押されても、送るのは1回だけ（CAR-F-004/AC-16）
  const sending = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (sending.current) return
    sending.current = true
    setSubmitting(true)
    setNotice(undefined)
    try {
      const result = await send(values)
      setErrors(result.kind === 'fieldErrors' ? result.errors : {})
      if (result.kind === 'notice') setNotice(result.message)
    } finally {
      sending.current = false
      setSubmitting(false)
    }
  }

  const topNotice = notice ?? errors._
  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <Stack>
        {topNotice && <Alert color="red">{topNotice}</Alert>}
        {carAndStartEditable && (
          <NativeSelect
            label="車"
            value={values.carId}
            onChange={(e) => set('carId')(e.currentTarget.value)}
            data={[{ value: '', label: '選んでください' }, ...carOptions]}
            error={errors.carId}
          />
        )}
        {carAndStartEditable && (
          <Group grow align="flex-start">
            <TextInput
              label="開始の日付"
              type="date"
              value={values.startDate}
              onChange={(e) => set('startDate')(e.currentTarget.value)}
              error={errors.startDate}
            />
            <TextInput
              label="開始の時刻"
              type="time"
              value={values.startTime}
              onChange={(e) => set('startTime')(e.currentTarget.value)}
              error={errors.startTime}
            />
          </Group>
        )}
        <Group grow align="flex-start">
          <TextInput
            label="終了の日付"
            type="date"
            value={values.endDate}
            onChange={(e) => set('endDate')(e.currentTarget.value)}
            error={errors.endDate}
          />
          <TextInput
            label="終了の時刻"
            type="time"
            value={values.endTime}
            onChange={(e) => set('endTime')(e.currentTarget.value)}
            error={errors.endTime}
          />
        </Group>
        <TextInput
          label="行き先"
          value={values.destination}
          onChange={(e) => set('destination')(e.currentTarget.value)}
          error={errors.destination}
        />
        <Textarea
          label="メモ"
          rows={3}
          value={values.memo}
          onChange={(e) => set('memo')(e.currentTarget.value)}
          error={errors.memo}
        />
        {onCancel ? (
          <Group grow>
            <Button variant="default" onClick={onCancel}>
              キャンセル
            </Button>
            <Button type="submit" loading={submitting}>
              {submitLabel}
            </Button>
          </Group>
        ) : (
          <Button type="submit" loading={submitting}>
            {submitLabel}
          </Button>
        )}
      </Stack>
    </form>
  )
}
