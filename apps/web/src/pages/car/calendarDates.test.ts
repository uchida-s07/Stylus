import { describe, expect, it } from 'vitest'
import { isMonthString, monthStart, monthVisibleRange, moveMonth } from './calendarDates'

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
})
