import { describe, expect, it } from 'vitest'
import {
  frameAt,
  frameToFields,
  HOUR_HEIGHT,
  minuteAt,
  moveFrame,
  offsetOf,
  resizeFrame,
} from './timeFrame'

// 時間割の枠の時刻の求め方（AC ではない確認。AC は T-17 の画面のテストで確かめる）
// 時刻はその日の 0:00 からの分（0〜1440）
const at = (h: number, m = 0) => h * 60 + m

describe('timeFrame', () => {
  describe('タップした所から枠を出す', () => {
    it('15分刻みに切り捨てた所から1時間（9:07 → 9:00〜10:00）', () => {
      expect(frameAt(at(9, 7))).toEqual({ start: at(9), end: at(10) })
      expect(frameAt(at(9, 15))).toEqual({ start: at(9, 15), end: at(10, 15) })
    })

    it('24:00 を越えるときは 24:00 で止める（23:30 → 23:30〜24:00）', () => {
      expect(frameAt(at(23, 30))).toEqual({ start: at(23, 30), end: 1440 })
      expect(frameAt(at(23, 59))).toEqual({ start: at(23, 45), end: 1440 })
    })

    it('0:00 より前・24:00 より後のタップはその日の中に収める', () => {
      expect(frameAt(-10)).toEqual({ start: 0, end: 60 })
      expect(frameAt(1440)).toEqual({ start: at(23, 45), end: 1440 })
    })
  })

  describe('端を引く', () => {
    const nineToTen = { start: at(9), end: at(10) }

    it('引いた所に近い15分刻みにそろう（下の端を 11:20 へ → 11:15、11:23 へ → 11:30）', () => {
      expect(resizeFrame(nineToTen, 'end', at(11, 20))).toEqual({ start: at(9), end: at(11, 15) })
      expect(resizeFrame(nineToTen, 'end', at(11, 23))).toEqual({ start: at(9), end: at(11, 30) })
    })

    it('上の端を 8:30 へ引くと 8:30〜10:00', () => {
      expect(resizeFrame(nineToTen, 'start', at(8, 30))).toEqual({ start: at(8, 30), end: at(10) })
    })

    it('反対の端と15分以上あける（下の端を 8:00 へ → 9:15、上の端を 11:00 へ → 9:45）', () => {
      expect(resizeFrame(nineToTen, 'end', at(8))).toEqual({ start: at(9), end: at(9, 15) })
      expect(resizeFrame(nineToTen, 'start', at(11))).toEqual({ start: at(9, 45), end: at(10) })
    })

    it('0:00〜24:00 の中に収める', () => {
      expect(resizeFrame(nineToTen, 'start', -30)).toEqual({ start: 0, end: at(10) })
      expect(resizeFrame(nineToTen, 'end', 1500)).toEqual({ start: at(9), end: 1440 })
    })
  })

  describe('枠ごと動かす', () => {
    it('引いた量に近い15分刻みにそろえて、長さを保って動く（35分下へ → 30分）', () => {
      expect(moveFrame({ start: at(9), end: at(10) }, 35)).toEqual({
        start: at(9, 30),
        end: at(10, 30),
      })
      expect(moveFrame({ start: at(9), end: at(10) }, -40)).toEqual({
        start: at(8, 15),
        end: at(9, 15),
      })
    })

    it('24:00 を越えない（22:00〜23:00 を2時間下へ → 23:00〜24:00）', () => {
      expect(moveFrame({ start: at(22), end: at(23) }, 120)).toEqual({ start: at(23), end: 1440 })
    })

    it('0:00 より前へは動かない', () => {
      expect(moveFrame({ start: at(0, 30), end: at(2) }, -120)).toEqual({
        start: 0,
        end: at(1, 30),
      })
    })
  })

  describe('時間割の上の端からの距離と分の換算', () => {
    it('1時間の高さで分にする（分は切り捨て、0〜1440 に収める）', () => {
      expect(minuteAt(HOUR_HEIGHT * 9)).toBe(at(9))
      expect(minuteAt(HOUR_HEIGHT * 9.5)).toBe(at(9, 30))
      expect(minuteAt(-5)).toBe(0)
      expect(minuteAt(HOUR_HEIGHT * 30)).toBe(1440)
    })

    it('分から上の端からの距離にする', () => {
      expect(offsetOf(at(9))).toBe(HOUR_HEIGHT * 9)
      expect(offsetOf(at(9, 30))).toBe(HOUR_HEIGHT * 9.5)
    })
  })

  describe('枠を入力の日時にする', () => {
    it('その日の開始・終了の日付と時刻（HH:MM）', () => {
      expect(frameToFields('2026-10-10', { start: at(9), end: at(12) })).toEqual({
        startDate: '2026-10-10',
        startTime: '09:00',
        endDate: '2026-10-10',
        endTime: '12:00',
      })
    })

    it('終了が 24:00 なら翌日の 0:00（月・年もまたぐ）', () => {
      expect(frameToFields('2026-10-10', { start: at(23, 30), end: 1440 })).toEqual({
        startDate: '2026-10-10',
        startTime: '23:30',
        endDate: '2026-10-11',
        endTime: '00:00',
      })
      expect(frameToFields('2026-12-31', { start: at(23), end: 1440 })).toMatchObject({
        endDate: '2027-01-01',
        endTime: '00:00',
      })
    })
  })
})
