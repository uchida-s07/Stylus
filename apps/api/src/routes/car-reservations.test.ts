import { reservationListResponseSchema, reservationSchema } from '@stylus/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCarTestApp, jstIso, type CarTestApp } from '../../test/car'
import type { FamilyKey } from '../../test/family'

// 今は既定で日本時間 2026-10-07 20:00（tasks.md D-3）
describe('予約の API（CAR-F-004〜008）', () => {
  let t: CarTestApp

  beforeEach(async () => {
    t = await createCarTestApp()
    await t.insertCar('ノア')
  })

  afterEach(async () => {
    await t.close()
  })

  type ReserveInput = {
    car?: string
    carId?: string
    from: string
    to: string
    destination?: string | null
    memo?: string | null
    requestId?: string
  }

  function reserveBody({ car = 'ノア', carId, from, to, requestId, ...rest }: ReserveInput) {
    return (async () => ({
      carId: carId ?? (await t.carId(car)),
      startsAt: jstIso(from),
      endsAt: jstIso(to),
      requestId: requestId ?? crypto.randomUUID(),
      ...rest,
    }))()
  }

  async function reserve(who: FamilyKey, input: ReserveInput) {
    return t.call(who, 'POST', '/car-reservations', await reserveBody(input))
  }

  async function upcoming(who: FamilyKey = 'father') {
    const res = await t.call(who, 'GET', '/car-reservations?view=upcoming')
    expect(res.status).toBe(200)
    return reservationListResponseSchema.parse(await res.json()).reservations
  }

  // 予定・履歴の1行を読みやすい形にする（日時は日本時間の「MM-DD HH:MM」）
  function summary(
    r: { car: { name: string }; member: { displayName: string } } & Record<string, unknown>,
  ) {
    const at = (iso: unknown) => {
      const d = new Date(new Date(iso as string).getTime() + 9 * 3600_000).toISOString()
      return `${d.slice(5, 10)} ${d.slice(11, 16)}`
    }
    return `${r.car.name} ${r.member.displayName} ${at(r.startsAt)}〜${at(r.endsAt)}`
  }

  describe('予約の登録と予定の基本（CAR-F-004）', () => {
    it('[CAR-F-004/AC-1] くうごが「ノア」を 10月10日 9:00〜12:00・行き先「大学」で予約すると、予約が1件でき、母の予定に出る', async () => {
      const res = await reserve('kugo', {
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
        destination: '大学',
      })
      expect(await t.reservationRows()).toHaveLength(1)
      const list = await upcoming('mother')
      expect(list.map(summary)).toEqual(['ノア くうご 10-10 09:00〜10-10 12:00'])
      expect(list[0]).toMatchObject({
        destination: '大学',
        car: { name: 'ノア', isActive: true },
        startsAt: jstIso('2026-10-10 09:00'),
        endsAt: jstIso('2026-10-10 12:00'),
      })
      expect(res.status).toBe(201)
      expect(reservationSchema.parse(await res.json())).toMatchObject({
        destination: '大学',
        member: { id: t.family.kugo.id, displayName: 'くうご' },
        version: 1,
      })
    })

    it('[CAR-F-004/AC-3] くうごの 9:00〜12:00 があっても、母の 12:00〜15:00 とせいごの 8:00〜9:00 はどちらも予約できる', async () => {
      await t.insertReservation({
        car: 'ノア',
        who: 'kugo',
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
      })
      const mother = await reserve('mother', { from: '2026-10-10 12:00', to: '2026-10-10 15:00' })
      const seigo = await reserve('seigo', { from: '2026-10-10 08:00', to: '2026-10-10 09:00' })
      expect((await upcoming()).map(summary)).toEqual([
        'ノア せいご 10-10 08:00〜10-10 09:00',
        'ノア くうご 10-10 09:00〜10-10 12:00',
        'ノア 母 10-10 12:00〜10-10 15:00',
      ])
      expect([mother.status, seigo.status]).toEqual([201, 201])
    })

    it('[CAR-F-004/AC-5] くうごの「ノア」9:00〜12:00 があっても、母は「フィット」を同じ時間で予約できる', async () => {
      await t.insertCar('フィット')
      await t.insertReservation({
        car: 'ノア',
        who: 'kugo',
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
      })
      const res = await reserve('mother', {
        car: 'フィット',
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
      })
      expect((await upcoming()).map(summary)).toEqual([
        'ノア くうご 10-10 09:00〜10-10 12:00',
        'フィット 母 10-10 09:00〜10-10 12:00',
      ])
      expect(res.status).toBe(201)
    })

    it('[CAR-F-004/AC-9] 日本時間 2026-10-07 20:00 に 10月7日 19:00〜22:00 で予約すると、予約ができ予定に出る（使用中）', async () => {
      const res = await reserve('kugo', { from: '2026-10-07 19:00', to: '2026-10-07 22:00' })
      expect((await upcoming()).map(summary)).toEqual(['ノア くうご 10-07 19:00〜10-07 22:00'])
      expect(res.status).toBe(201)
    })

    it('[CAR-F-004/AC-11] 21日間の予約と、1年以上先の予約のどちらも予約できる', async () => {
      const long = await reserve('kugo', { from: '2026-10-10 09:00', to: '2026-10-31 09:00' })
      const far = await reserve('kugo', { from: '2027-12-01 09:00', to: '2027-12-01 12:00' })
      expect((await upcoming()).map(summary)).toEqual([
        'ノア くうご 10-10 09:00〜10-31 09:00',
        'ノア くうご 12-01 09:00〜12-01 12:00',
      ])
      expect([long.status, far.status]).toEqual([201, 201])
    })
  })
})
