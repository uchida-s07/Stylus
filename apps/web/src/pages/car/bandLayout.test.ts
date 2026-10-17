import { describe, expect, it } from 'vitest'
import { layoutBands } from './bandLayout'

// 時間割の帯の横の並べ方（AC ではない確認。CAR-F-005/AC-10 は画面のテストで確かめる）
const at = (h: number) => h * 60
const placesOf = (spans: { id: string; start: number; end: number }[]) =>
  Object.fromEntries(layoutBands(spans))

describe('layoutBands', () => {
  it('重ならない帯は、それぞれ幅いっぱい（1列）', () => {
    expect(
      placesOf([
        { id: 'a', start: at(9), end: at(12) },
        { id: 'b', start: at(12), end: at(15) },
      ]),
    ).toEqual({ a: { column: 0, columns: 1 }, b: { column: 0, columns: 1 } })
  })

  it('同じ時間の2本は2列に分けて横に並べる', () => {
    expect(
      placesOf([
        { id: 'a', start: at(9), end: at(12) },
        { id: 'b', start: at(9), end: at(12) },
      ]),
    ).toEqual({ a: { column: 0, columns: 2 }, b: { column: 1, columns: 2 } })
  })

  it('重なりでつながる塊ごとに列を数え、空いた列は使い回す', () => {
    // a と b が重なり、c は a の後で b と重なる（2列）。d は塊の外（1列）
    expect(
      placesOf([
        { id: 'a', start: at(8), end: at(10) },
        { id: 'b', start: at(9), end: at(12) },
        { id: 'c', start: at(10), end: at(11) },
        { id: 'd', start: at(13), end: at(14) },
      ]),
    ).toEqual({
      a: { column: 0, columns: 2 },
      b: { column: 1, columns: 2 },
      c: { column: 0, columns: 2 },
      d: { column: 0, columns: 1 },
    })
  })

  it('3本が同時に重なると3列', () => {
    expect(
      placesOf([
        { id: 'a', start: at(9), end: at(12) },
        { id: 'b', start: at(10), end: at(11) },
        { id: 'c', start: at(10), end: at(13) },
      ]),
    ).toEqual({
      a: { column: 0, columns: 3 },
      b: { column: 2, columns: 3 },
      c: { column: 1, columns: 3 },
    })
  })
})
