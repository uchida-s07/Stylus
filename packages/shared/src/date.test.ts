import { describe, expect, it } from 'vitest'
import { toJstDate } from './date'

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
