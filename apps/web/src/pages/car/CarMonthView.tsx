import { Center, Loader } from '@mantine/core'
import { useNavigate, useSearchParams } from 'react-router'
import { api } from '../../api/client'
import { callApi } from '../../api/responses'
import { ErrorScreen } from '../../components/ErrorScreen'
import { combineResults, useApiLoad } from '../../components/useApiLoad'
import { monthVisibleRange } from './calendarDates'
import { MonthCalendar } from './CarCalendar'
import { CarPageFrame } from './CarPageFrame'
import { NoCars } from './NoCars'

// 車の画面の月のカレンダーの画面（CAR-F-005。month は YYYY-MM）
// 予約は見えている範囲（6週）を1回で引く
// 日を押すとその日の時間割の画面へ移る（履歴を積み、端末の「戻る」で月へ戻れる）
// 前の月・次の月・「今日」は ?month= を置き換える（履歴は積まない）
export function CarMonthView({ month }: { month: string }) {
  const [, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const range = monthVisibleRange(`${month}-01`)
  const { state } = useApiLoad(async () =>
    combineResults([
      await callApi(() => api.cars.$get()),
      await callApi(() => api['car-reservations'].$get({ query: { view: 'range', ...range } })),
    ]),
  )

  if (state.kind === 'error') return <ErrorScreen kind={state.error} />
  return (
    <CarPageFrame>
      {state.kind === 'loading' ? (
        <Center py="xl">
          <Loader aria-label="読み込み中" />
        </Center>
      ) : state.data[0].cars.length === 0 ? (
        <NoCars />
      ) : (
        <MonthCalendar
          month={month}
          reservations={state.data[1].reservations}
          onSelectDate={(date) => void navigate({ search: `?date=${date}` })}
          onMoveMonth={(m) => setSearchParams({ month: m }, { replace: true })}
        />
      )}
    </CarPageFrame>
  )
}
