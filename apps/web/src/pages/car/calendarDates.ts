import { addDays } from '@stylus/shared'

// 車の画面の月のカレンダーの日付（日付はどれも日本時間の YYYY-MM-DD）
// 週は日曜から（FullCalendar の ja と同じ）。月のカレンダーはいつも6週（42日）を出す

const VISIBLE_DAYS = 42

// その日を含む月の1日
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`
}

// その日を含む月のカレンダーに見えている範囲（両端を含む）。予約はこの範囲を1回で引く
export function monthVisibleRange(date: string): { from: string; to: string } {
  const first = monthStart(date)
  // 1日の曜日（0 が日曜）。日付は暦の上の値なので UTC で読む
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay()
  const from = addDays(first, -weekday)
  return { from, to: addDays(from, VISIBLE_DAYS - 1) }
}
