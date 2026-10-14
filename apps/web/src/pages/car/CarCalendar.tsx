import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/react/daygrid'
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
  type Reservation,
} from '@stylus/shared'
import { Badge, Stack, Text, Title } from '@mantine/core'
import { monthStart, monthVisibleRange } from './calendarDates'
import { timeRange } from './format'
import './car-calendar.css'

// 車の画面のカレンダー（CAR-F-005）：上に月のカレンダー、下に選んだ日の時間割
// FullCalendar には日本時間（Asia/Tokyo）を渡して出すだけにし、日付はアプリが toJstDate() で求める（COMMON-N-009）
// 月のカレンダーは月が変わるたび、時間割は日が変わるたびに作り直す（最初の表示位置をその日に合わせるため）

const COMMON_OPTIONS = {
  timeZone: 'Asia/Tokyo',
  locale: jaLocale,
  headerToolbar: false,
} as const

export function CarCalendar({
  selectedDate,
  reservations,
  onSelectDate,
}: {
  // 選んだ日（日本時間の YYYY-MM-DD）
  selectedDate: string
  // 月のカレンダーに見えている範囲の予約（API が開始の早い順に返したもの）
  reservations: Reservation[]
  onSelectDate: (date: string) => void
}) {
  const month = monthStart(selectedDate)
  return (
    <Stack>
      <MonthCalendar
        key={month}
        month={month}
        selectedDate={selectedDate}
        reservedDays={reservedDays(reservations, monthVisibleRange(month))}
        onSelectDate={onSelectDate}
      />
      <DayTimeGrid key={selectedDate} date={selectedDate} reservations={reservations} />
    </Stack>
  )
}

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

// 月のカレンダー。日を押すとその日を選ぶ。予約のある日に印（点）を出す
// 日のボタンは、FullCalendar が読み上げから外す（aria-hidden）日のセルの上の部分に入る。日付の読み上げはセルが持つ
function MonthCalendar({
  month,
  selectedDate,
  reservedDays,
  onSelectDate,
}: {
  month: string
  selectedDate: string
  reservedDays: Set<string>
  onSelectDate: (date: string) => void
}) {
  const title = `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`
  return (
    <section aria-label={`${title}のカレンダー`}>
      <Title order={2} size="h4" mb="xs">
        {title}
      </Title>
      <FullCalendar
        {...COMMON_OPTIONS}
        plugins={[dayGridPlugin, classicThemePlugin]}
        initialView="dayGridMonth"
        initialDate={month}
        height="auto"
        // 日のボタンをセルの幅いっぱいに広げる（car-calendar.css）
        dayCellTopClass="car-day-top"
        dayCellTopContent={(cell) => {
          // cell.date は日本時間のその日の 0:00
          const date = toJstDate(cell.date)
          const label = formatJstDate(cell.date)
          const hasReservations = reservedDays.has(date)
          return (
            <button
              type="button"
              className="car-day"
              aria-label={hasReservations ? `${label}、予約あり` : label}
              aria-pressed={date === selectedDate}
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

// 選んだ日の時間割（0:00〜24:00、30分の目盛り）。予約を帯で出す
function DayTimeGrid({ date, reservations }: { date: string; reservations: Reservation[] }) {
  const label = formatJstDate(jstStartOfDay(date)!)
  return (
    <section aria-label={`${label}の時間割`}>
      <Title order={2} size="h4" mb="xs">
        {label}
      </Title>
      <FullCalendar
        {...COMMON_OPTIONS}
        plugins={[timeGridPlugin, classicThemePlugin]}
        initialView="timeGridDay"
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
        events={reservations.map((r) => ({
          id: r.id,
          start: r.startsAt,
          end: r.endsAt,
          extendedProps: { reservation: r },
        }))}
        eventContent={(arg) => (
          <ReservationBand reservation={arg.event.extendedProps.reservation as Reservation} />
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

// 帯の中身：車の名前・表示名・時間・行き先。使用中なら「使用中」
// 「使用中」の印は端末の時計で決める（見た目だけ。判定は API が行う）
function ReservationBand({ reservation: r }: { reservation: Reservation }) {
  const inUse = reservationPhase(r.startsAt, r.endsAt, new Date()) === 'in_use'
  return (
    <div className="car-band" data-reservation-id={r.id}>
      <Text size="xs" fw={700} lh={1.3} truncate>
        {r.car.name} {r.member.displayName}
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
