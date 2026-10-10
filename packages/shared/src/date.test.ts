import { describe, expect, it } from 'vitest'
import {
  formatJstDate,
  formatJstDateTime,
  formatJstTime,
  fromJstDateTime,
  toJstDate,
  toJstTime,
} from './date'

describe('toJstDate（COMMON-N-009）', () => {
  it('[COMMON-N-009/AC-1] 2026-10-01T15:00:00Z（日本時間 10月2日 0:00）は 2026-10-02 になる', () => {
    expect(toJstDate(new Date('2026-10-01T15:00:00Z'))).toBe('2026-10-02')
  })

  it('[COMMON-N-009/AC-2] 2026-10-01T14:59:59Z（日本時間 10月1日 23:59:59）は 2026-10-01 になる', () => {
    expect(toJstDate(new Date('2026-10-01T14:59:59Z'))).toBe('2026-10-01')
  })
})

// AC ではない境界の確認
describe('toJstDate の境界', () => {
  it('年をまたぐ：2026-12-31T15:00:00Z は 2027-01-01 になる', () => {
    expect(toJstDate(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01')
  })

  it('月をまたぐ：2027-02-28T15:00:00Z は 2027-03-01 になる', () => {
    expect(toJstDate(new Date('2027-02-28T15:00:00Z'))).toBe('2027-03-01')
  })
})

// 日本時間の日時の表示と入力（spec 003。AC ではない境界の確認）
describe('日本時間の日時の表示', () => {
  it('日付の見出しは「10月10日(土)」の形で、曜日は日本時間の日付で決める', () => {
    expect(formatJstDate('2026-10-10T00:00:00Z')).toBe('10月10日(土)')
    // UTC では 10月9日(金) 15:00、日本時間では 10月10日(土) 0:00
    expect(formatJstDate(new Date('2026-10-09T15:00:00Z'))).toBe('10月10日(土)')
    expect(formatJstDate('2026-10-09T14:59:00Z')).toBe('10月9日(金)')
    expect(formatJstDate('2026-10-07T11:00:00Z')).toBe('10月7日(水)')
    expect(formatJstDate('2026-10-11T00:00:00Z')).toBe('10月11日(日)')
  })

  it('時刻は「9:00」の形（時はゼロで埋めず、分は2桁）', () => {
    expect(formatJstTime('2026-10-10T00:00:00Z')).toBe('9:00')
    expect(formatJstTime('2026-10-10T00:05:00Z')).toBe('9:05')
    expect(formatJstTime('2026-10-10T13:00:00Z')).toBe('22:00')
    expect(formatJstTime('2026-10-09T15:00:00Z')).toBe('0:00')
  })

  it('日時は「10月10日(土) 9:00」の形', () => {
    expect(formatJstDateTime('2026-10-10T00:00:00Z')).toBe('10月10日(土) 9:00')
    expect(formatJstDateTime('2026-10-10T17:00:00Z')).toBe('10月11日(日) 2:00')
  })

  it('時刻の入力欄の値は「09:00」の形', () => {
    expect(toJstTime('2026-10-10T00:00:00Z')).toBe('09:00')
    expect(toJstTime('2026-10-10T14:30:00Z')).toBe('23:30')
  })
})

describe('fromJstDateTime', () => {
  it('日本時間の日付と時刻から日時を作る', () => {
    expect(fromJstDateTime('2026-10-10', '09:00')?.toISOString()).toBe('2026-10-10T00:00:00.000Z')
    expect(fromJstDateTime('2026-10-10', '08:30')?.toISOString()).toBe('2026-10-09T23:30:00.000Z')
    expect(fromJstDateTime('2027-01-01', '00:00')?.toISOString()).toBe('2026-12-31T15:00:00.000Z')
  })

  it('形が違う・空・存在しない日付なら null', () => {
    expect(fromJstDateTime('', '09:00')).toBeNull()
    expect(fromJstDateTime('2026-10-10', '')).toBeNull()
    expect(fromJstDateTime('2026-10-10', '9:00')).toBeNull()
    expect(fromJstDateTime('2026-10-10', '24:00')).toBeNull()
    expect(fromJstDateTime('2026-02-30', '09:00')).toBeNull()
  })
})
