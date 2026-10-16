import { addDays } from '@stylus/shared'

// 時間割の枠（CAR-F-004）の時刻の求め方。時刻はその日の 0:00 からの分（0〜1440）で扱う
// 枠はその日の 0:00〜24:00 の中で動き、端は15分刻み、長さは15分より短くならない

// 1時間の高さ（px）。jsdom では寸法が0なので、位置と時刻の換算はこの値だけで行う
export const HOUR_HEIGHT = 48

const DAY = 1440
const STEP = 15
const FIRST_LENGTH = 60

export type Frame = { start: number; end: number }

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
const snap = (minute: number) => Math.round(minute / STEP) * STEP

// タップした所から出す枠：15分刻みに切り捨てた所から1時間。24:00 を越えるなら 24:00 で止める
export function frameAt(minute: number): Frame {
  const start = clamp(Math.floor(minute / STEP) * STEP, 0, DAY - STEP)
  return { start, end: Math.min(start + FIRST_LENGTH, DAY) }
}

// 端を引く：引いた所に近い15分刻みにそろえ、反対の端と15分以上あけ、0〜1440 に収める
export function resizeFrame(frame: Frame, edge: 'start' | 'end', minute: number): Frame {
  const at = snap(minute)
  return edge === 'start'
    ? { start: clamp(at, 0, frame.end - STEP), end: frame.end }
    : { start: frame.start, end: clamp(at, frame.start + STEP, DAY) }
}

// 枠ごと動かす：引いた量に近い15分刻みにそろえ、長さを保ったまま 0〜1440 の中で止める
export function moveFrame(frame: Frame, delta: number): Frame {
  const length = frame.end - frame.start
  const start = clamp(frame.start + snap(delta), 0, DAY - length)
  return { start, end: start + length }
}

// 時間割の上の端からの距離（px）を分にする（切り捨て、0〜1440 に収める）
export function minuteAt(offsetY: number): number {
  return clamp(Math.floor((offsetY / HOUR_HEIGHT) * 60), 0, DAY)
}

// 分を時間割の上の端からの距離（px）にする
export function offsetOf(minute: number): number {
  return (minute / 60) * HOUR_HEIGHT
}

// 枠を入力の日時にする（date はその日の YYYY-MM-DD。終了が 24:00 なら翌日の 0:00）
export function frameToFields(
  date: string,
  frame: Frame,
): { startDate: string; startTime: string; endDate: string; endTime: string } {
  const end =
    frame.end === DAY ? { date: addDays(date, 1), minute: 0 } : { date, minute: frame.end }
  return {
    startDate: date,
    startTime: hhmm(frame.start),
    endDate: end.date,
    endTime: hhmm(end.minute),
  }
}

function hhmm(minute: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
}
