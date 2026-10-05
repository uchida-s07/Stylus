import { describe, expect, it } from 'vitest'
import { computeSettlement } from './settlement'

// design.md「合計と精算額」（AC ではない。計算そのものの確認）
// requestedBySelf：名義の側（self）が請求した＝相手が払う
describe('精算額の計算', () => {
  it('両方向を差し引く：self が請求 3,500・相手が請求 1,000 なら、相手が self に 2,500', () => {
    expect(
      computeSettlement([
        { amount: 3000, requestedBySelf: true },
        { amount: 500, requestedBySelf: true },
        { amount: 1000, requestedBySelf: false },
      ]),
    ).toEqual({
      selfRequestedTotal: 3500,
      counterpartRequestedTotal: 1000,
      amount: 2500,
      payer: 'counterpart',
    })
  })

  it('相手の請求のほうが多ければ self が払う', () => {
    expect(
      computeSettlement([
        { amount: 1000, requestedBySelf: true },
        { amount: 4000, requestedBySelf: false },
      ]),
    ).toEqual({
      selfRequestedTotal: 1000,
      counterpartRequestedTotal: 4000,
      amount: 3000,
      payer: 'self',
    })
  })

  it('片方向だけ', () => {
    expect(computeSettlement([{ amount: 700, requestedBySelf: false }])).toEqual({
      selfRequestedTotal: 0,
      counterpartRequestedTotal: 700,
      amount: 700,
      payer: 'self',
    })
  })

  it('差し引き 0円 なら払う側は決まらない', () => {
    expect(
      computeSettlement([
        { amount: 1000, requestedBySelf: true },
        { amount: 1000, requestedBySelf: false },
      ]),
    ).toEqual({ selfRequestedTotal: 1000, counterpartRequestedTotal: 1000, amount: 0, payer: null })
  })

  it('請求が無ければ 0円', () => {
    expect(computeSettlement([])).toEqual({
      selfRequestedTotal: 0,
      counterpartRequestedTotal: 0,
      amount: 0,
      payer: null,
    })
  })
})
