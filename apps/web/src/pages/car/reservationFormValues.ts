import { CAR_MESSAGES, fromJstDateTime, toJstDate, toJstTime } from '@stylus/shared'

// 予約のフォーム（ReservationForm）の値と、API の入力への変換
// 日時は日付（YYYY-MM-DD）と時刻（HH:MM）の欄に分ける（日本時間）
export type ReservationFormValues = {
  carId: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  destination: string
  memo: string
}

export type ReservationFieldErrors = Partial<Record<keyof ReservationFormValues | '_', string>>

// 送った結果：成功、項目ごとの知らせ、フォームの上に出す知らせ
export type ReservationSendResult =
  | { kind: 'ok' }
  | { kind: 'fieldErrors'; errors: ReservationFieldErrors }
  | { kind: 'notice'; message: string }

// 日付と時刻の欄から API の日時（ISO 8601）を作る。どちらかが空・形が違えば undefined（「入力してください」）
export function toIso(date: string, time: string): string | undefined {
  return fromJstDateTime(date, time)?.toISOString()
}

// 日時を日付と時刻の欄の値にする
export function toDateTimeFields(instant: string): { date: string; time: string } {
  return { date: toJstDate(new Date(instant)), time: toJstTime(instant) }
}

// 開始の1時間後（開始を選んだとき、終了が空なら入れる）
export function oneHourLater(date: string, time: string): { date: string; time: string } | null {
  const start = fromJstDateTime(date, time)
  if (!start) return null
  return toDateTimeFields(new Date(start.getTime() + 60 * 60 * 1000).toISOString())
}

const PERIOD_FIELDS = {
  startsAt: ['startDate', 'startTime'],
  endsAt: ['endDate', 'endTime'],
} as const

// API・スキーマの項目（carId・startsAt・endsAt・destination・memo）の知らせを、フォームの欄に振り分ける
// 開始・終了の知らせは、空の欄があればその欄に「入力してください」、無ければ時刻の欄に出す
export function toFieldErrors(
  fields: Record<string, string>,
  values: ReservationFormValues,
): ReservationFieldErrors {
  const errors: ReservationFieldErrors = {}
  for (const [key, message] of Object.entries(fields)) {
    if (key === 'startsAt' || key === 'endsAt') {
      const [dateKey, timeKey] = PERIOD_FIELDS[key]
      if (values[dateKey] === '') errors[dateKey] = CAR_MESSAGES.required
      else if (values[timeKey] === '') errors[timeKey] = CAR_MESSAGES.required
      else errors[timeKey] = message
    } else if (key === 'carId' || key === 'destination' || key === 'memo') {
      errors[key] = message
    } else {
      errors._ = message
    }
  }
  return errors
}

// スキーマの失敗を項目ごとの知らせにする（項目ごとに最初の1つ）
export function issuesToFields(error: {
  issues: { path: PropertyKey[]; message: string }[]
}): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) fields[String(issue.path[0] ?? '_')] ??= issue.message
  return fields
}
