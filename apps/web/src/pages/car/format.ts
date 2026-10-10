import { formatJstDate, formatJstDateTime, formatJstTime, toJstDate } from '@stylus/shared'

// 予約の時間の表示：同じ日なら「9:00〜12:00」、日をまたぐなら終了に日付も添える「22:00〜10月11日(日) 2:00」
export function timeRange(startsAt: string, endsAt: string): string {
  const end =
    toJstDate(new Date(startsAt)) === toJstDate(new Date(endsAt))
      ? formatJstTime(endsAt)
      : formatJstDateTime(endsAt)
  return `${formatJstTime(startsAt)}〜${end}`
}

// 日付つきの予約の時間：「10月10日(土) 10:00〜11:00」（重なりの知らせ・予約の中身）
export function periodLabel(startsAt: string, endsAt: string): string {
  return `${formatJstDate(startsAt)} ${timeRange(startsAt, endsAt)}`
}
