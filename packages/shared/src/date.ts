// 日本時間は UTC+9 で固定（夏時間が無い）。Intl を使わず足し算で求める（Workers の CPU 時間を節約）
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

// 日時が日本時間で何日か（YYYY-MM-DD）を求める。日付の区切りはすべてこれを使う（COMMON-N-009）
export function toJstDate(instant: Date): string {
  return new Date(instant.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10)
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

// 日本時間の壁時計の値（getUTC* で読む）
function jstClock(instant: Date | string): Date {
  return new Date(new Date(instant).getTime() + JST_OFFSET_MS)
}

// 日本時間の日付の見出し：10月10日(土)。曜日は日本時間の日付で決める
export function formatJstDate(instant: Date | string): string {
  const c = jstClock(instant)
  return `${c.getUTCMonth() + 1}月${c.getUTCDate()}日(${WEEKDAYS[c.getUTCDay()]})`
}

// 日本時間の時刻：9:00（時はゼロで埋めない）
export function formatJstTime(instant: Date | string): string {
  const c = jstClock(instant)
  return `${c.getUTCHours()}:${String(c.getUTCMinutes()).padStart(2, '0')}`
}

// 日本時間の日時：10月10日(土) 9:00
export function formatJstDateTime(instant: Date | string): string {
  return `${formatJstDate(instant)} ${formatJstTime(instant)}`
}

// 時刻の入力欄（type="time"）の値：09:00
export function toJstTime(instant: Date | string): string {
  return jstClock(instant).toISOString().slice(11, 16)
}

// 日付の入力欄（YYYY-MM-DD）と時刻の入力欄（HH:MM）の日本時間の値から日時を作る。形が違えば null
export function fromJstDateTime(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null
  const clock = new Date(`${date}T${time}:00.000Z`)
  // 2026-02-30 のような存在しない日付は、繰り上がって別の日付になる
  if (Number.isNaN(clock.getTime()) || clock.toISOString().slice(0, 10) !== date) return null
  return new Date(clock.getTime() - JST_OFFSET_MS)
}

// ---- 日付（YYYY-MM-DD）の部品（spec 004：期間で引く予約・カレンダー） ----
// 日付は暦の上の値なので、UTC の 0:00 に置いて足し引きする（時間帯に左右されない）
const DAY_MS = 24 * 60 * 60 * 1000

function dateAtUtcMidnight(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const d = new Date(`${date}T00:00:00.000Z`)
  // 2026-02-30 のような存在しない日付は、繰り上がって別の日付になる
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return null
  return d
}

// 実在する日付（YYYY-MM-DD）か
export function isDateString(value: string): boolean {
  return dateAtUtcMidnight(value) !== null
}

// 日本時間のその日の 0:00 の日時。形が違えば null
export function jstStartOfDay(date: string): Date | null {
  return fromJstDateTime(date, '00:00')
}

// 日付に日数を足す（負なら引く）。date は実在する日付であること
export function addDays(date: string, days: number): string {
  const d = dateAtUtcMidnight(date)
  if (!d) throw new Error(`日付の形が違う: ${date}`)
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

// 2つの日付の間の日数（to − from）。どちらも実在する日付であること
export function diffDays(from: string, to: string): number {
  const f = dateAtUtcMidnight(from)
  const t = dateAtUtcMidnight(to)
  if (!f || !t) throw new Error(`日付の形が違う: ${from}, ${to}`)
  return Math.round((t.getTime() - f.getTime()) / DAY_MS)
}
