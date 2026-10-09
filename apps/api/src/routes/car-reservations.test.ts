import {
  reservationDetailSchema,
  reservationListResponseSchema,
  reservationSchema,
} from '@stylus/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCarTestApp, expectError, jstIso, type CarTestApp } from '../../test/car'
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

  async function reserveBody({ car = 'ノア', carId, from, to, requestId, ...rest }: ReserveInput) {
    return {
      carId: carId ?? (await t.carId(car)),
      startsAt: jstIso(from),
      endsAt: jstIso(to),
      requestId: requestId ?? crypto.randomUUID(),
      ...rest,
    }
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

  describe('予約の登録の入力の検証（CAR-F-004）', () => {
    it('[CAR-F-004/AC-7] 終了日時を空にして予約すると、予約は作られず終了日時に「入力してください」', async () => {
      const { endsAt: _omitted, ...body } = await reserveBody({
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
      })
      void _omitted
      const res = await t.call('kugo', 'POST', '/car-reservations', body)
      expect(await t.reservationRows()).toHaveLength(0)
      const error = await expectError(res, 400, 'invalid_input')
      expect(error.fields?.endsAt).toBe('入力してください')
    })

    it('[CAR-F-004/AC-8] 10月10日 12:00〜12:00 と 12:00〜11:00 はどちらも作られず「終了は開始より後にしてください」', async () => {
      const same = await reserve('kugo', { from: '2026-10-10 12:00', to: '2026-10-10 12:00' })
      const before = await reserve('kugo', { from: '2026-10-10 12:00', to: '2026-10-10 11:00' })
      expect(await t.reservationRows()).toHaveLength(0)
      for (const res of [same, before]) {
        const error = await expectError(res, 400, 'invalid_input')
        expect(error.fields?.endsAt).toBe('終了は開始より後にしてください')
      }
    })

    it('[CAR-F-004/AC-10] 日本時間 2026-10-07 20:00 に 10月7日 18:00〜20:00 で予約すると、作られず「終了の日時が過ぎています」', async () => {
      const res = await reserve('kugo', { from: '2026-10-07 18:00', to: '2026-10-07 20:00' })
      expect(await t.reservationRows()).toHaveLength(0)
      const error = await expectError(res, 400, 'invalid_input')
      expect(error.fields?.endsAt).toBe('終了の日時が過ぎています')
    })

    it('[CAR-F-004/AC-18] 行き先を51文字にして予約すると、予約は作られない', async () => {
      const res = await reserve('kugo', {
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
        destination: 'あ'.repeat(51),
      })
      expect(await t.reservationRows()).toHaveLength(0)
      const error = await expectError(res, 400, 'invalid_input')
      expect(error.fields?.destination).toBe('50文字以内で入力してください')
    })

    it('[CAR-F-004/AC-19] メモを501文字にすると作られず、500文字なら予約できる', async () => {
      const over = await reserve('kugo', {
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
        memo: 'あ'.repeat(501),
      })
      expect(await t.reservationRows()).toHaveLength(0)
      await expectError(over, 400, 'invalid_input')
      const ok = await reserve('kugo', {
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
        memo: 'あ'.repeat(500),
      })
      expect(await t.reservationRows()).toHaveLength(1)
      expect(ok.status).toBe(201)
    })

    // AC ではない確認
    it('行き先・メモは前後の空白を除いて保存し、空白だけなら無しにする', async () => {
      await reserve('kugo', {
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
        destination: '　大学 ',
        memo: ' 　',
      })
      const [row] = await t.reservationRows()
      expect(row).toMatchObject({ destination: '大学', memo: null })
    })
  })

  describe('時間が重なる予約を止める（CAR-F-004）', () => {
    it('[CAR-F-004/AC-2] 母の「ノア」10:00〜11:00 があるとき、くうごの 9:00〜12:00 は作られず、重なった母の予約が知らされる', async () => {
      const mother = await t.insertReservation({
        car: 'ノア',
        who: 'mother',
        from: '2026-10-10 10:00',
        to: '2026-10-10 11:00',
      })
      const res = await reserve('kugo', { from: '2026-10-10 09:00', to: '2026-10-10 12:00' })
      expect((await t.reservationRows()).map((r) => r.id)).toEqual([mother.id])
      const error = await expectError(res, 409, 'overlap')
      expect(error.conflict).toEqual({
        displayName: '母',
        startsAt: jstIso('2026-10-10 10:00'),
        endsAt: jstIso('2026-10-10 11:00'),
      })
    })

    it('[CAR-F-004/AC-4] くうごの「ノア」9:00〜12:00 があるとき、母の 11:59〜15:00 は作られない', async () => {
      await t.insertReservation({
        car: 'ノア',
        who: 'kugo',
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
      })
      const res = await reserve('mother', { from: '2026-10-10 11:59', to: '2026-10-10 15:00' })
      expect(await t.reservationRows()).toHaveLength(1)
      await expectError(res, 409, 'overlap')
    })

    it('[CAR-F-004/AC-6] くうごの 9:00〜12:00 とせいごの 10:00〜13:00 が同時に呼ばれると、1件だけでき、もう一方には 409', async () => {
      const results = await Promise.all([
        reserve('kugo', { from: '2026-10-10 09:00', to: '2026-10-10 12:00' }),
        reserve('seigo', { from: '2026-10-10 10:00', to: '2026-10-10 13:00' }),
      ])
      expect(await t.reservationRows()).toHaveLength(1)
      expect(results.map((r) => r.status).sort()).toEqual([201, 409])
      const lost = results.find((r) => r.status === 409)!
      await expectError(lost, 409, 'overlap')
    })

    // AC ではない確認
    it('自分の予約と重なるときも止める', async () => {
      await t.insertReservation({
        car: 'ノア',
        who: 'kugo',
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
      })
      const res = await reserve('kugo', { from: '2026-10-10 11:00', to: '2026-10-10 13:00' })
      const error = await expectError(res, 409, 'overlap')
      expect(error.conflict?.displayName).toBe('くうご')
    })
  })

  describe('選んだ車が「使わない」・削除されていたとき（CAR-F-004）', () => {
    it('[CAR-F-004/AC-12] 入力している間に「ノア」が「使わない」になったら、予約は作られず「この車は今は予約できません。選び直してください」', async () => {
      const body = await reserveBody({ from: '2026-10-10 09:00', to: '2026-10-10 12:00' })
      expect(
        (await t.call('mother', 'PATCH', `/cars/${body.carId}`, { isActive: false })).status,
      ).toBe(200)
      const res = await t.call('kugo', 'POST', '/car-reservations', body)
      expect(await t.reservationRows()).toHaveLength(0)
      const error = await expectError(res, 409, 'car_unavailable')
      expect(error.message).toBe('この車は今は予約できません。選び直してください')
    })

    it('[CAR-F-004/AC-20] 入力している間に「ノア」が削除されたら、予約は作られず「この車は見つかりません。」', async () => {
      const body = await reserveBody({ from: '2026-10-10 09:00', to: '2026-10-10 12:00' })
      await t.deleteCar(body.carId)
      const res = await t.call('kugo', 'POST', '/car-reservations', body)
      expect(await t.reservationRows()).toHaveLength(0)
      const error = await expectError(res, 400, 'invalid_input')
      expect(error.fields?.carId).toBe('この車は見つかりません。')
    })
  })

  describe('予約の二重登録を防ぐ（CAR-F-004）', () => {
    it('[CAR-F-004/AC-16] 「予約する」を続けて2回押しても（同じ request_id が2回届いても）、予約は1件だけできる', async () => {
      const body = await reserveBody({ from: '2026-10-10 09:00', to: '2026-10-10 12:00' })
      const results = await Promise.all([
        t.call('kugo', 'POST', '/car-reservations', body),
        t.call('kugo', 'POST', '/car-reservations', body),
      ])
      expect(await t.reservationRows()).toHaveLength(1)
      expect(results.map((r) => r.status)).toEqual([201, 201])
      const [a, b] = await Promise.all(
        results.map(async (r) => reservationSchema.parse(await r.json())),
      )
      expect(a!.id).toBe(b!.id)
    })

    it('[CAR-F-004/AC-17] 1回目が保存された後に行き先を直して同じ request_id で送り直すと、1件のままで「この予約はすでに登録されています。…」', async () => {
      const body = await reserveBody({
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
        destination: '大学',
      })
      expect((await t.call('kugo', 'POST', '/car-reservations', body)).status).toBe(201)
      const res = await t.call('kugo', 'POST', '/car-reservations', { ...body, destination: '駅' })
      const rows = await t.reservationRows()
      expect(rows.map((r) => r.destination)).toEqual(['大学'])
      const error = await expectError(res, 409, 'already_registered')
      expect(error.message).toBe(
        'この予約はすでに登録されています。予定で確かめて、必要なら直してください。',
      )
    })

    // AC ではない確認
    it('同じ中身を順に2回送ると、2回目は1回目の予約をそのまま返す', async () => {
      const body = await reserveBody({ from: '2026-10-10 09:00', to: '2026-10-10 12:00' })
      const first = reservationSchema.parse(
        await (await t.call('kugo', 'POST', '/car-reservations', body)).json(),
      )
      const res = await t.call('kugo', 'POST', '/car-reservations', body)
      expect(res.status).toBe(201)
      expect(reservationSchema.parse(await res.json()).id).toBe(first.id)
      expect(await t.reservationRows()).toHaveLength(1)
    })
  })

  describe('予定の一覧と予約の中身（CAR-F-005）', () => {
    it('[CAR-F-005/AC-1] 10月7日 20:00 に父が開くと、使用中のくうご・10月8日の母の順に出て、終わったせいごの予約は出ない', async () => {
      // 登録の順と開始の順を変えておく
      await t.insertReservation({
        car: 'ノア',
        who: 'mother',
        from: '2026-10-08 09:00',
        to: '2026-10-08 10:00',
      })
      await t.insertReservation({
        car: 'ノア',
        who: 'kugo',
        from: '2026-10-07 19:00',
        to: '2026-10-07 22:00',
      })
      await t.insertReservation({
        car: 'ノア',
        who: 'seigo',
        from: '2026-10-07 08:00',
        to: '2026-10-07 10:00',
      })
      expect((await upcoming('father')).map(summary)).toEqual([
        'ノア くうご 10-07 19:00〜10-07 22:00',
        'ノア 母 10-08 09:00〜10-08 10:00',
      ])
    })

    it('[CAR-F-005/AC-2] 10月7日 22:00 に、19:00〜22:00 の予約だけがあるとき、予定は空', async () => {
      t.setNow('2026-10-07 22:00')
      await t.insertReservation({
        car: 'ノア',
        who: 'kugo',
        from: '2026-10-07 19:00',
        to: '2026-10-07 22:00',
      })
      expect(await upcoming()).toEqual([])
    })

    it('[CAR-F-005/AC-3] 10月10日 22:00〜10月11日 2:00 の予約は、終了の日時つきで出る', async () => {
      await t.insertReservation({
        car: 'ノア',
        who: 'kugo',
        from: '2026-10-10 22:00',
        to: '2026-10-11 02:00',
      })
      const list = await upcoming()
      expect(list.map(summary)).toEqual(['ノア くうご 10-10 22:00〜10-11 02:00'])
      expect(list[0]?.endsAt).toBe(jstIso('2026-10-11 02:00'))
    })

    it('[CAR-F-005/AC-4] 「使わない」の車「ノア」のくうごのこれからの予約も出て、「使わない」の印が付く', async () => {
      await t.insertReservation({
        car: 'ノア',
        who: 'kugo',
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
      })
      await t.call('seigo', 'PATCH', `/cars/${await t.carId('ノア')}`, { isActive: false })
      const list = await upcoming()
      expect(list.map(summary)).toEqual(['ノア くうご 10-10 09:00〜10-10 12:00'])
      expect(list[0]?.car.isActive).toBe(false)
    })

    it('[CAR-F-005/AC-5] 母がくうごの予約を開くと、行き先「大学」とメモ「帰りに給油する」が出る', async () => {
      const r = await t.insertReservation({
        car: 'ノア',
        who: 'kugo',
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
        destination: '大学',
        memo: '帰りに給油する',
      })
      const res = await t.call('mother', 'GET', `/car-reservations/${r.id}`)
      expect(res.status).toBe(200)
      expect(reservationDetailSchema.parse(await res.json())).toMatchObject({
        destination: '大学',
        memo: '帰りに給油する',
        member: { displayName: 'くうご' },
        isMine: false,
      })
    })

    // AC ではない確認
    it('本人が開くと isMine が true。取り消された予約は 404 not_found「この予約は見つかりません。」', async () => {
      const r = await t.insertReservation({
        car: 'ノア',
        who: 'kugo',
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
      })
      const mine = await t.call('kugo', 'GET', `/car-reservations/${r.id}`)
      expect(reservationDetailSchema.parse(await mine.json()).isMine).toBe(true)
      await t.deleteReservation(r.id)
      const error = await expectError(
        await t.call('kugo', 'GET', `/car-reservations/${r.id}`),
        404,
        'not_found',
      )
      expect(error.message).toBe('この予約は見つかりません。')
    })

    it('開始が同じなら車の名前の順', async () => {
      await t.insertCar('アクア')
      await t.insertReservation({
        car: 'ノア',
        who: 'kugo',
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
      })
      await t.insertReservation({
        car: 'アクア',
        who: 'mother',
        from: '2026-10-10 09:00',
        to: '2026-10-10 10:00',
      })
      expect((await upcoming()).map(summary)).toEqual([
        'アクア 母 10-10 09:00〜10-10 10:00',
        'ノア くうご 10-10 09:00〜10-10 12:00',
      ])
    })
  })
})
