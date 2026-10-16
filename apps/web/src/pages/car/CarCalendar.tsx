import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import interactionPlugin from '@fullcalendar/react/interaction'
import jaLocale from '@fullcalendar/react/locales/ja'
import classicThemePlugin from '@fullcalendar/react/themes/classic'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/classic/theme.css'
import '@fullcalendar/react/themes/classic/palette.css'
import {
  addDays,
  formatJstDate,
  jstStartOfDay,
  reservationPhase,
  toJstDate,
  toJstTime,
  type CarListItem,
  type Reservation,
} from '@stylus/shared'
import { Badge, Button, Group, Text, Title } from '@mantine/core'
import { useNavigate } from 'react-router'
import { monthOf, monthVisibleRange, moveMonth } from './calendarDates'
import { carColor } from './carColors'
import { timeRange } from './format'
import { timeGridRef } from './timeGridRef'
import './car-calendar.css'

// 車の画面のカレンダー（CAR-F-005）：月のカレンダーの画面の月のカレンダーと、日の画面の時間割
// FullCalendar には日本時間（Asia/Tokyo）を渡して出すだけにし、日付はアプリが toJstDate() で求める（COMMON-N-009）
// どちらも月・日が変わるたびに車の画面が作り直す（最初の表示位置をその月・日に合わせるため）

const COMMON_OPTIONS = {
  timeZone: 'Asia/Tokyo',
  locale: jaLocale,
  headerToolbar: false,
} as const

// 予約が一部でもかかる日（終了がちょうど 0:00 の日は含めない）。範囲の外は数えない
function reservedDays(reservations: Reservation[], range: { from: string; to: string }) {
  const days = new Set<string>()
  for (const r of reservations) {
    const first = toJstDate(new Date(r.startsAt))
    const last = toJstDate(new Date(new Date(r.endsAt).getTime() - 1))
    for (
      let d = first < range.from ? range.from : first;
      d <= last && d <= range.to;
      d = addDays(d, 1)
    ) {
      days.add(d)
    }
  }
  return days
}

// 月のカレンダー（month は YYYY-MM）。日を押すとその日の時間割の画面へ。予約のある日に印（点）を出す
// 日のボタンは、FullCalendar が読み上げから外す（aria-hidden）日のセルの上の部分に入る。日付の読み上げはセルが持つ
export function MonthCalendar({
  month,
  reservations,
  onSelectDate,
  onMoveMonth,
}: {
  month: string
  // 見えている範囲の予約
  reservations: Reservation[]
  onSelectDate: (date: string) => void
  onMoveMonth: (month: string) => void
}) {
  const title = `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`
  const days = reservedDays(reservations, monthVisibleRange(`${month}-01`))
  return (
    <section aria-label={`${title}のカレンダー`}>
      <Group justify="space-between" wrap="nowrap" mb="xs">
        <Title order={2} size="h4">
          {title}
        </Title>
        <MonthMoves month={month} onMoveMonth={onMoveMonth} />
      </Group>
      <FullCalendar
        {...COMMON_OPTIONS}
        plugins={[dayGridPlugin, classicThemePlugin]}
        initialView="dayGridMonth"
        initialDate={`${month}-01`}
        height="auto"
        // 日のボタンをセルの幅いっぱいに広げる（car-calendar.css）
        dayCellTopClass="car-day-top"
        dayCellTopContent={(cell) => {
          // cell.date は日本時間のその日の 0:00
          const date = toJstDate(cell.date)
          const label = formatJstDate(cell.date)
          const hasReservations = days.has(date)
          return (
            <button
              type="button"
              className="car-day"
              aria-label={hasReservations ? `${label}、予約あり` : label}
              data-day-label={label}
              data-has-reservations={hasReservations}
              onClick={() => onSelectDate(date)}
            >
              <span>{Number(date.slice(8))}</span>
              {hasReservations && <span className="car-day-dot" aria-hidden />}
            </button>
          )
        }}
      />
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

// 日の画面の時間割（0:00〜24:00、30分の目盛り）。予約を帯で出す。見出しは日の画面が出す
export function DayTimeGrid({
  date,
  cars,
  reservations,
  onSelectRange,
}: {
  date: string
  cars: CarListItem[]
  reservations: Reservation[]
  onSelectRange: (start: Date, end: Date) => void
}) {
  const navigate = useNavigate()
  const label = formatJstDate(jstStartOfDay(date)!)
  // 一覧に無い車（読み込みの間に増えた車）は 0 番の色にする
  const colorIndexOf = (carId: string) => cars.find((c) => c.id === carId)?.colorIndex ?? 0
  return (
    <section aria-label={`${label}の時間割`}>
      <FullCalendar
        {...COMMON_OPTIONS}
        ref={timeGridRef}
        plugins={[timeGridPlugin, interactionPlugin, classicThemePlugin]}
        initialView="timeGridDay"
        // 範囲を選べる（マウスはドラッグ、タッチは長押ししてから引く。FullCalendar の標準）
        selectable
        select={(info) => onSelectRange(info.start, info.end)}
        // 選んでいる範囲（テストは選んだ範囲が残っているかをこのクラスで確かめる）
        highlightClass="car-selection"
        initialDate={date}
        height={480}
        dayHeaders={false}
        allDaySlot={false}
        slotDuration="00:30"
        snapDuration="00:15"
        scrollTime={firstScrollTime(date)}
        nowIndicator
        // 同じ時間の帯は重ねずに横に並べる（どちらも隠れない）
        slotEventOverlap={false}
        // 帯の右に、帯の無い余白をいつも残す（そこから範囲を選べるように。幅は car-calendar.css）
        dayLaneInnerClass="car-lane-inner"
        events={reservations.map((r) => {
          const colorIndex = colorIndexOf(r.car.id)
          return {
            id: r.id,
            start: r.startsAt,
            end: r.endsAt,
            color: carColor(colorIndex),
            // 帯はその予約の中身へのリンク（押したときはアプリの中で移る。下の eventClick）
            url: `/car/reservations/${r.id}`,
            extendedProps: { reservation: r, colorIndex },
          }
        })}
        eventClick={(arg) => {
          arg.jsEvent.preventDefault()
          void navigate(arg.event.url)
        }}
        // 「使わない」の車の帯は薄くする（car-calendar.css）
        eventClass={(arg) =>
          (arg.event.extendedProps.reservation as Reservation).car.isActive
            ? ''
            : 'car-band-inactive'
        }
        eventContent={(arg) => (
          <ReservationBand
            reservation={arg.event.extendedProps.reservation as Reservation}
            colorIndex={arg.event.extendedProps.colorIndex as number}
          />
        )}
      />
    </section>
  )
}

// 最初の表示位置：今日なら今の時刻の1時間前、それ以外の日は 8:00
function firstScrollTime(date: string): string {
  const now = new Date()
  if (date !== toJstDate(now)) return '08:00'
  const hour = Number(toJstTime(now).slice(0, 2))
  return `${String(Math.max(hour - 1, 0)).padStart(2, '0')}:00`
}

// 帯の中身：車の名前（「使わない」の車には「使わない」を添える）・表示名・時間・行き先。使用中なら「使用中」
// 「使用中」の印は端末の時計で決める（見た目だけ。判定は API が行う）
// 色の番号と「使わない」の印はデータの属性にも付ける
function ReservationBand({
  reservation: r,
  colorIndex,
}: {
  reservation: Reservation
  colorIndex: number
}) {
  const inUse = reservationPhase(r.startsAt, r.endsAt, new Date()) === 'in_use'
  return (
    <div
      className="car-band"
      data-reservation-id={r.id}
      data-color-index={colorIndex}
      data-inactive={!r.car.isActive}
    >
      <Text size="xs" fw={700} lh={1.3} truncate>
        {r.car.name}
        {!r.car.isActive && '（使わない）'} {r.member.displayName}
      </Text>
      <Text size="xs" lh={1.3}>
        {timeRange(r.startsAt, r.endsAt)}
      </Text>
      {r.destination && (
        <Text size="xs" lh={1.3} truncate>
          {r.destination}
        </Text>
      )}
      {inUse && (
        <Badge size="xs" variant="filled" color="orange">
          使用中
        </Badge>
      )}
    </div>
  )
}
