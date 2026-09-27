// 日本時間は UTC+9 で固定（夏時間が無い）。Intl を使わず足し算で求める（Workers の CPU 時間を節約）
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

// 日時が日本時間で何日か（YYYY-MM-DD）を求める。日付の区切りはすべてこれを使う（COMMON-N-009）
export function toJstDate(instant: Date): string {
  return new Date(instant.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10)
}
