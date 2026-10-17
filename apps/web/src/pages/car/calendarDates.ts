import { addDays, toJstDate } from '@stylus/shared'

// 車の画面の月のカレンダーの日付（日付はどれも日本時間の YYYY-MM-DD、月は YYYY-MM）
// 週は日曜から。月のカレンダーはいつも6週（42日）を出す

export const VISIBLE_DAYS = 42

// その日を含む月の1日
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`
}

// その日を含む月（YYYY-MM）
export function monthOf(date: string): string {
  return date.slice(0, 7)
}

// ?month= の月の形（YYYY-MM、月は 01〜12）
export function isMonthString(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
}

// その日を含む月のカレンダーに見えている範囲（両端を含む）。予約はこの範囲を1回で引く
export function monthVisibleRange(date: string): { from: string; to: string } {
  const first = monthStart(date)
  // 1日の曜日（0 が日曜）。日付は暦の上の値なので UTC で読む
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay()
  const from = addDays(first, -weekday)
  return { from, to: addDays(from, VISIBLE_DAYS - 1) }
}

// 前の月・次の月（delta は -1 か 1）
export function moveMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const months = y * 12 + (m - 1) + delta
  return `${String(Math.floor(months / 12)).padStart(4, '0')}-${String((months % 12) + 1).padStart(2, '0')}`
}

// 日ごとの予約（月のカレンダーの帯）：その日に一部でもかかる予約を、開始の早い順に（同じなら渡された順）
// 終了がちょうど 0:00 の日には入れない。範囲（両端を含む）の外の日は入れない
export function reservationsByDay<R extends { startsAt: string; endsAt: string }>(
  reservations: R[],
  range: { from: string; to: string },
): Map<string, R[]> {
  const byDay = new Map<string, R[]>()
  const sorted = [...reservations].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  for (const r of sorted) {
    const first = toJstDate(new Date(r.startsAt))
    const last = toJstDate(new Date(Date.parse(r.endsAt) - 1))
    for (
      let d = first < range.from ? range.from : first;
      d <= last && d <= range.to;
      d = addDays(d, 1)
    ) {
      byDay.set(d, [...(byDay.get(d) ?? []), r])
    }
  }
  return byDay
}
