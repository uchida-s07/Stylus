import { describe, expect, it } from 'vitest'
import { reservationPhase } from './phase'

// 予約の状態の求め方（[開始, 終了)。AC ではない境界の確認）
describe('reservationPhase', () => {
  const startsAt = '2026-10-10T00:00:00.000Z'
  const endsAt = '2026-10-10T03:00:00.000Z'
  const at = (iso: string) => new Date(iso)

  it('開始より前は まだ始まっていない', () => {
    expect(reservationPhase(startsAt, endsAt, at('2026-10-09T23:59:00Z'))).toBe('not_started')
  })

  it('開始ちょうどは 使用中', () => {
    expect(reservationPhase(startsAt, endsAt, at('2026-10-10T00:00:00Z'))).toBe('in_use')
  })

  it('終了の直前は 使用中', () => {
    expect(reservationPhase(startsAt, endsAt, at('2026-10-10T02:59:59.999Z'))).toBe('in_use')
  })

  it('終了ちょうどは 終わった', () => {
    expect(reservationPhase(startsAt, endsAt, at('2026-10-10T03:00:00Z'))).toBe('ended')
  })

  it('Date でも文字列でも同じに求める', () => {
    expect(reservationPhase(at(startsAt), at(endsAt), at('2026-10-10T01:00:00Z'))).toBe('in_use')
  })
})
