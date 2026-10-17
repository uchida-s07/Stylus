import { addDays, formatJstDate, jstStartOfDay, toJstDate, type Reservation } from '@stylus/shared'
import { Button, Center, Group, Loader, Title } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { api } from '../../api/client'
import { callApi } from '../../api/responses'
import { ErrorScreen } from '../../components/ErrorScreen'
import { combineResults, useApiLoad } from '../../components/useApiLoad'
import { monthOf } from './calendarDates'
import { CarPageFrame } from './CarPageFrame'
import { NoCars } from './NoCars'
import { ReservationDialog } from './ReservationDialog'
import type { ReservationFormValues } from './reservationFormValues'
import { frameAt, frameToFields, type Frame } from './timeFrame'
import { TimeGrid } from './TimeGrid'

// 車の画面の日の時間割の画面（CAR-F-004・CAR-F-005。date は日本時間の YYYY-MM-DD）
// 予約はその日だけを引く（from = to = その日）
// 「月へ戻る」はその日を含む月へ、前の日・次の日はその日へ、どれも URL を置き換える（履歴は積まない）
export function CarDayView({ date }: { date: string }) {
  const [, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  // 枠から出した予約の入力（開くたびに key と requestId を作り直す）
  // 開くときに履歴を1つ積み（入力の印 reservationDialog を持つ）、その履歴にいる間だけ出す
  // 端末の「戻る」・「キャンセル」・保存は、どれも積んだ履歴を戻して閉じる（日の画面からは離れない）
  const [dialog, setDialog] = useState<{ key: string; initial: ReservationFormValues }>()
  const dialogKey = (location.state as { reservationDialog?: string } | null)?.reservationDialog
  const dialogOpen = dialog !== undefined && dialog.key === dialogKey
  // 時間割の枠（空いた所のタップで出し、端や中を引いて動かす）
  // 枠から入力を開くと、その入力の key を枠に持たせる。入力の履歴から離れたら（閉じたら）その枠は出さない
  const [framed, setFramed] = useState<{ frame: Frame; dialogKey?: string } | null>(null)
  const frame =
    framed && (framed.dialogKey === undefined || framed.dialogKey === dialogKey)
      ? framed.frame
      : null
  // 保存した予約の開始の日（入力の履歴を戻した後にその日へ移る）
  const dateAfterClose = useRef<string>(undefined)
  // 空いた所をタップしたが「使う」の車が無い（CAR-F-004/AC-24）
  const [noActiveCars, setNoActiveCars] = useState(false)
  const { state, reload } = useApiLoad(async () =>
    combineResults([
      await callApi(() => api.cars.$get()),
      await callApi(() =>
        api['car-reservations'].$get({ query: { view: 'range', from: date, to: date } }),
      ),
    ]),
  )

  const activeCars = state.kind === 'ready' ? state.data[0].cars.filter((c) => c.isActive) : []

  // 空いた所をタップした：1時間の枠を出す（「使う」の車が無ければ枠を出さずに知らせる）
  function tapEmpty(minute: number) {
    if (activeCars.length === 0) return setNoActiveCars(true)
    setNoActiveCars(false)
    setFramed({ frame: frameAt(minute) })
  }

  // 枠をタップした：枠の開始・終了が入った入力を出す（車は「使う」の車が1台だけなら選んでおく）
  function openFrame() {
    if (!frame) return
    const f = frameToFields(date, frame)
    const key = crypto.randomUUID()
    setFramed({ frame, dialogKey: key })
    void navigate({ search: location.search }, { state: { reservationDialog: key } })
    setDialog({
      key,
      initial: {
        carId: activeCars.length === 1 ? activeCars[0]!.id : '',
        startDate: f.startDate,
        startTime: f.startTime,
        endDate: f.endDate,
        endTime: f.endTime,
        destination: '',
        memo: '',
      },
    })
  }

  // 入力を閉じる：積んだ履歴を戻す（戻った後の片付けは下の useEffect）
  function closeDialog() {
    void navigate(-1)
  }

  // 保存できたら入力を閉じ、予約の開始の日へ移って読み直す
  function created(r: Reservation) {
    dateAfterClose.current = toJstDate(new Date(r.startsAt))
    closeDialog()
  }

  // 入力の履歴から離れた（「戻る」・「キャンセル」・保存）：保存したならその日へ移って読み直す（枠は上で出さなくなる）
  // （別の日へ移ったときは車の画面が日の画面を作り直して読み込む）
  useEffect(() => {
    if (dialogKey !== undefined) return
    const next = dateAfterClose.current
    if (next === undefined) return
    dateAfterClose.current = undefined
    if (next === date) return reload()
    setSearchParams({ date: next }, { replace: true })
  }, [dialogKey, date, setSearchParams, reload])

  if (state.kind === 'error') return <ErrorScreen kind={state.error} />
  return (
    <CarPageFrame>
      <DayHeader
        date={date}
        onMoveDate={(d) => setSearchParams({ date: d }, { replace: true })}
        onBackToMonth={() => setSearchParams({ month: monthOf(date) }, { replace: true })}
      />
      {state.kind === 'loading' ? (
        <Center py="xl">
          <Loader aria-label="読み込み中" />
        </Center>
      ) : state.data[0].cars.length === 0 ? (
        <NoCars />
      ) : (
        <>
          {noActiveCars && <NoCars message="先に車を登録してください" />}
          <TimeGrid
            date={date}
            cars={state.data[0].cars}
            reservations={state.data[1].reservations}
            frame={frame}
            onTapEmpty={tapEmpty}
            onFrameChange={(f) => setFramed({ frame: f })}
            onClearFrame={() => setFramed(null)}
            onOpenFrame={openFrame}
          />
        </>
      )}
      {dialogOpen && (
        <ReservationDialog
          key={dialog.key}
          initial={dialog.initial}
          carOptions={activeCars.map((c) => ({ value: c.id, label: c.name }))}
          requestId={dialog.key}
          onClose={closeDialog}
          onCreated={created}
        />
      )}
    </CarPageFrame>
  )
}

// 日の画面の見出し：「月へ戻る」、その日の日付（「10月10日(土)」）、前の日・次の日
function DayHeader({
  date,
  onMoveDate,
  onBackToMonth,
}: {
  date: string
  onMoveDate: (date: string) => void
  onBackToMonth: () => void
}) {
  return (
    <div>
      <Button variant="subtle" size="xs" px={0} onClick={onBackToMonth}>
        月へ戻る
      </Button>
      <Group justify="space-between" wrap="nowrap">
        <Title order={2} size="h4">
          {formatJstDate(jstStartOfDay(date)!)}
        </Title>
        <Group gap={4} wrap="nowrap">
          <Button
            variant="default"
            size="xs"
            aria-label="前の日"
            onClick={() => onMoveDate(addDays(date, -1))}
          >
            ‹
          </Button>
          <Button
            variant="default"
            size="xs"
            aria-label="次の日"
            onClick={() => onMoveDate(addDays(date, 1))}
          >
            ›
          </Button>
        </Group>
      </Group>
    </div>
  )
}
