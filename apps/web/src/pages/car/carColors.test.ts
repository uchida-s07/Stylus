import { describe, expect, it } from 'vitest'
import { CAR_COLORS, carColor } from './carColors'

// 車の色（AC ではない確認）
describe('carColors', () => {
  it('決まった8色が、どれも違う', () => {
    expect(CAR_COLORS).toHaveLength(8)
    expect(new Set(CAR_COLORS).size).toBe(8)
  })

  it('色の番号の順に色を返し、9台目からは繰り返す', () => {
    expect(carColor(0)).toBe(CAR_COLORS[0])
    expect(carColor(7)).toBe(CAR_COLORS[7])
    expect(carColor(8)).toBe(CAR_COLORS[0])
    expect(carColor(9)).toBe(CAR_COLORS[1])
  })
})
