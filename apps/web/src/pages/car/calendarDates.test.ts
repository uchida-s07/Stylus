import { describe, expect, it } from 'vitest'
import {
  isMonthString,
  monthStart,
  monthVisibleRange,
  moveMonth,
  reservationsByDay,
} from './calendarDates'

// 月のカレンダーの日付の求め方（AC ではない確認）
describe('calendarDates', () => {
  it('月の1日を求める', () => {
    expect(monthStart('2026-10-07')).toBe('2026-10-01')
    expect(monthStart('2026-10-31')).toBe('2026-10-01')
  })

  it('見えている範囲は、1日を含む週の日曜からの42日', () => {
    // 2026年10月1日は木曜
    expect(monthVisibleRange('2026-10-07')).toEqual({ from: '2026-09-27', to: '2026-11-07' })
  })

  it('1日が日曜の月は、その1日から始まる', () => {
    // 2026年11月1日は日曜
    expect(monthVisibleRange('2026-11-15')).toEqual({ from: '2026-11-01', to: '2026-12-12' })
  })

  it('1日が土曜の月は、前の日曜から始まる', () => {
    // 2026年8月1日は土曜
    expect(monthVisibleRange('2026-08-20')).toEqual({ from: '2026-07-26', to: '2026-09-05' })
  })

  it('年をまたぐ', () => {
    // 2027年1月1日は金曜
    expect(monthVisibleRange('2027-01-01')).toEqual({ from: '2026-12-27', to: '2027-02-06' })
  })

  it('前の月・次の月へ移ると、その月（YYYY-MM）になる', () => {
    expect(moveMonth('2026-10', -1)).toBe('2026-09')
    expect(moveMonth('2026-10', 1)).toBe('2026-11')
  })

  it('12月から1月、1月から12月へ年をまたぐ', () => {
    expect(moveMonth('2026-12', 1)).toBe('2027-01')
    expect(moveMonth('2027-01', -1)).toBe('2026-12')
  })

  it('?month= の月は YYYY-MM で、月は 01〜12', () => {
    expect(isMonthString('2026-10')).toBe(true)
    expect(isMonthString('2027-01')).toBe(true)
    expect(isMonthString('2026-13')).toBe(false)
    expect(isMonthString('2026-00')).toBe(false)
    expect(isMonthString('2026-1')).toBe(false)
    expect(isMonthString('2026-10-01')).toBe(false)
  })

  describe('日ごとの予約の振り分け（月のカレンダーの帯）', () => {
    // 日本時間の「YYYY-MM-DD HH:MM」で予約を作る
    const r = (id: string, from: string, to: string) => ({
      id,
      startsAt: new Date(`${from.replace(' ', 'T')}:00+09:00`).toISOString(),
      endsAt: new Date(`${to.replace(' ', 'T')}:00+09:00`).toISOString(),
    })
    const october = { from: '2026-09-27', to: '2026-11-07' }
    const ids = (map: Map<string, { id: string }[]>) =>
      Object.fromEntries([...map].map(([d, list]) => [d, list.map((x) => x.id)]))

    it('その日に一部でもかかる予約を、またいだ日それぞれに入れる', () => {
      const byDay = reservationsByDay([r('a', '2026-10-10 22:00', '2026-10-12 02:00')], october)
      expect(ids(byDay)).toEqual({ '2026-10-10': ['a'], '2026-10-11': ['a'], '2026-10-12': ['a'] })
    })

    it('終了がちょうど 0:00 の日には入れない', () => {
      const byDay = reservationsByDay([r('a', '2026-10-08 22:00', '2026-10-09 00:00')], october)
      expect(ids(byDay)).toEqual({ '2026-10-08': ['a'] })
    })

    it('日ごとに開始の早い順に並べる（日をまたいで前の日から続く予約が先）', () => {
      const byDay = reservationsByDay(
        [
          r('late', '2026-10-11 15:00', '2026-10-11 16:00'),
          r('early', '2026-10-11 09:00', '2026-10-11 10:00'),
          r('overnight', '2026-10-10 22:00', '2026-10-11 02:00'),
        ],
        october,
      )
      expect(ids(byDay)['2026-10-11']).toEqual(['overnight', 'early', 'late'])
    })

    it('見えている範囲の外の日は入れない', () => {
      const byDay = reservationsByDay(
        [
          r('before', '2026-09-26 22:00', '2026-09-27 02:00'),
          r('after', '2026-11-07 22:00', '2026-11-08 02:00'),
        ],
        october,
      )
      expect(ids(byDay)).toEqual({ '2026-09-27': ['before'], '2026-11-07': ['after'] })
    })
  })
})
