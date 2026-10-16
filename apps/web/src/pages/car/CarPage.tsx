import { isDateString, toJstDate, type Reservation } from '@stylus/shared'
import {
  ActionIcon,
  Anchor,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Menu,
  Stack,
  Title,
} from '@mantine/core'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../../api/client'
import { callApi } from '../../api/responses'
import { ErrorScreen } from '../../components/ErrorScreen'
import { combineResults, useApiLoad } from '../../components/useApiLoad'
import { monthVisibleRange } from './calendarDates'
import { CarCalendar } from './CarCalendar'
import { NoCars } from './NoCars'
import { ReservationDialog } from './ReservationDialog'
import { toDateTimeFields, type ReservationFormValues } from './reservationFormValues'
import { timeGridRef } from './timeGridRef'

// 車の画面（CAR-F-005）：月のカレンダーと、選んだ日の時間割
// 選んだ日は URL の ?date=YYYY-MM-DD（無い・形が違うときは今日）。日を選ぶと置き換える（履歴は積まない）
// 予約は、月のカレンダーに見えている範囲（6週）を1回で引き、選んだ日の時間割も同じ結果から出す
// 履歴と車の管理へは、右上のメニューから進む
export function CarPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const selectedDate = dateParam && isDateString(dateParam) ? dateParam : toJstDate(new Date())
  const range = monthVisibleRange(selectedDate)
  // 時間割で範囲を選んで出した予約の入力（開くたびに key と requestId を作り直す）
  const [dialog, setDialog] = useState<{ key: string; initial: ReservationFormValues }>()
  // 範囲を選んだが「使う」の車が無い（CAR-F-004/AC-24）
  const [noActiveCars, setNoActiveCars] = useState(false)
  const { state, reload } = useApiLoad(
    async () =>
      combineResults([
        await callApi(() => api.cars.$get()),
        await callApi(() => api['car-reservations'].$get({ query: { view: 'range', ...range } })),
      ]),
    range.from,
  )

  function selectDate(date: string) {
    setSearchParams({ date }, { replace: true })
  }

  const activeCars = state.kind === 'ready' ? state.data[0].cars.filter((c) => c.isActive) : []

  // 時間割で範囲を選んだ：開始・終了が入った入力を出す（車は「使う」の車が1台だけなら選んでおく）
  function selectRange(start: Date, end: Date) {
    if (activeCars.length === 0) {
      timeGridRef.current?.getApi().unselect()
      return setNoActiveCars(true)
    }
    setNoActiveCars(false)
    const s = toDateTimeFields(start.toISOString())
    const e = toDateTimeFields(end.toISOString())
    setDialog({
      key: crypto.randomUUID(),
      initial: {
        carId: activeCars.length === 1 ? activeCars[0]!.id : '',
        startDate: s.date,
        startTime: s.time,
        endDate: e.date,
        endTime: e.time,
        destination: '',
        memo: '',
      },
    })
  }

  function closeDialog() {
    setDialog(undefined)
    timeGridRef.current?.getApi().unselect()
  }

  // 保存できたら入力を閉じ、予約の開始の日を選んで読み直す
  function created(r: Reservation) {
    closeDialog()
    selectDate(toJstDate(new Date(r.startsAt)))
    reload()
  }

  if (state.kind === 'error') return <ErrorScreen kind={state.error} />
  return (
    <Container component="main" aria-label="車" py="md">
      <Stack>
        <Group justify="space-between" wrap="nowrap">
          <Title order={1}>車</Title>
          <Group gap="xs" wrap="nowrap">
            <Anchor component={Link} to="/">
              ホームへ
            </Anchor>
            <CarMenu />
          </Group>
        </Group>
        <Button component={Link} to="/car/reservations/new">
          予約する
        </Button>
        {state.kind === 'loading' ? (
          <Center py="xl">
            <Loader aria-label="読み込み中" />
          </Center>
        ) : state.data[0].cars.length === 0 ? (
          <NoCars />
        ) : (
          <>
            {noActiveCars && <NoCars message="先に車を登録してください" />}
            <CarCalendar
              selectedDate={selectedDate}
              cars={state.data[0].cars}
              reservations={state.data[1].reservations}
              onSelectDate={selectDate}
              onSelectRange={selectRange}
            />
          </>
        )}
        {dialog && (
          <ReservationDialog
            key={dialog.key}
            initial={dialog.initial}
            carOptions={activeCars.map((c) => ({ value: c.id, label: c.name }))}
            requestId={dialog.key}
            onClose={closeDialog}
            onCreated={created}
          />
        )}
      </Stack>
    </Container>
  )
}

// 右上のメニュー：履歴と車の管理
function CarMenu() {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="subtle" size="lg" aria-label="メニュー">
          ⋯
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={Link} to="/car/history">
          履歴
        </Menu.Item>
        <Menu.Item component={Link} to="/car/cars">
          車の管理
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
