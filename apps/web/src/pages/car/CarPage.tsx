import { isDateString, toJstDate } from '@stylus/shared'
import { useSearchParams } from 'react-router'
import { isMonthString, monthOf } from './calendarDates'
import { CarDayView } from './CarDayView'
import { CarMonthView } from './CarMonthView'

// 車の画面（CAR-F-005）：URL で月のカレンダーの画面と日の時間割の画面を振り分ける
// ?date=YYYY-MM-DD（実在する日付）があれば日の画面、無ければ月の画面（?month=YYYY-MM の月。無い・形が違うときは今月）
// ?date= の形が違うときは今月の月の画面。月・日が変わるたびに作り直す（読み込み中は前の月・日の予約を出さない）
// 履歴と車の管理へは、右上のメニューから進む
export function CarPage() {
  const [searchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  if (dateParam && isDateString(dateParam)) {
    return <CarDayView key={`day-${dateParam}`} date={dateParam} />
  }
  const monthParam = searchParams.get('month')
  const month =
    monthParam && isMonthString(monthParam) ? monthParam : monthOf(toJstDate(new Date()))
  return <CarMonthView key={`month-${month}`} month={month} />
}
