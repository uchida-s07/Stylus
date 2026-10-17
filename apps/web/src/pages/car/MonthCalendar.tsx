import {
  addDays,
  formatJstDate,
  jstStartOfDay,
  toJstDate,
  type CarListItem,
  type Reservation,
} from '@stylus/shared'
import { Button, Group, Title } from '@mantine/core'
import {
  monthOf,
  monthVisibleRange,
  moveMonth,
  reservationsByDay,
  VISIBLE_DAYS,
} from './calendarDates'
import { carColor } from './carColors'
import './car-calendar.css'

// 車の画面の月のカレンダー（CAR-F-005。month は YYYY-MM）。Mantine と React で自作する（spec 004 F-3）
// 日曜から始まる6週（42日）。日のセルはボタンで、帯の上を含むどこを押してもその日の時間割の画面へ
// 日には、その日に一部でもかかる予約を開始の早い順に、車の色の短い帯（車の名前）で出す
// 3件までは帯で、4件以上は2件を帯で出して残りを「他 n 件」とする
// 日付はすべて日本時間（@stylus/shared の日付の部品。COMMON-N-009）

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const MAX_BANDS = 3

export function MonthCalendar({
  month,
  cars,
  reservations,
  onSelectDate,
  onMoveMonth,
}: {
  month: string
  // 車の一覧（帯の色の番号 colorIndex を引く）
  cars: CarListItem[]
  // 見えている範囲の予約
  reservations: Reservation[]
  onSelectDate: (date: string) => void
  onMoveMonth: (month: string) => void
}) {
  const title = `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`
  const range = monthVisibleRange(`${month}-01`)
  const byDay = reservationsByDay(reservations, range)
  const today = toJstDate(new Date())
  // 一覧に無い車（読み込みの間に増えた車）は 0 番の色にする
  const colorIndexOf = (carId: string) => cars.find((c) => c.id === carId)?.colorIndex ?? 0
  const days = Array.from({ length: VISIBLE_DAYS }, (_, i) => addDays(range.from, i))
  return (
    <section aria-label={`${title}のカレンダー`}>
      <Group justify="space-between" wrap="nowrap" mb="xs">
        <Title order={2} size="h4">
          {title}
        </Title>
        <MonthMoves month={month} onMoveMonth={onMoveMonth} />
      </Group>
      <div className="car-month">
        {WEEKDAYS.map((w) => (
          <div key={w} className="car-month-weekday" aria-hidden>
            {w}
          </div>
        ))}
        {days.map((date) => {
          const list = byDay.get(date) ?? []
          const shown = list.length > MAX_BANDS ? list.slice(0, MAX_BANDS - 1) : list
          const more = list.length - shown.length
          return (
            <button
              key={date}
              type="button"
              className="car-month-day"
              aria-label={formatJstDate(jstStartOfDay(date)!)}
              data-date={date}
              data-outside={monthOf(date) !== month}
              data-today={date === today}
              onClick={() => onSelectDate(date)}
            >
              <span className="car-month-day-number">{Number(date.slice(8))}</span>
              {shown.map((r) => {
                const colorIndex = colorIndexOf(r.car.id)
                return (
                  <span
                    key={r.id}
                    className="car-month-band"
                    style={{ background: carColor(colorIndex) }}
                    data-reservation-id={r.id}
                    data-color-index={colorIndex}
                    data-inactive={!r.car.isActive}
                  >
                    {r.car.name}
                  </span>
                )
              })}
              {more > 0 && (
                <span className="car-month-more" data-more>
                  他 {more} 件
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// 前の月・次の月と「今日」（今月へ）
function MonthMoves({
  month,
  onMoveMonth,
}: {
  month: string
  onMoveMonth: (month: string) => void
}) {
  return (
    <Group gap={4} wrap="nowrap">
      <Button
        variant="default"
        size="xs"
        aria-label="前の月"
        onClick={() => onMoveMonth(moveMonth(month, -1))}
      >
        ‹
      </Button>
      <Button
        variant="default"
        size="xs"
        onClick={() => onMoveMonth(monthOf(toJstDate(new Date())))}
      >
        今日
      </Button>
      <Button
        variant="default"
        size="xs"
        aria-label="次の月"
        onClick={() => onMoveMonth(moveMonth(month, 1))}
      >
        ›
      </Button>
    </Group>
  )
}
