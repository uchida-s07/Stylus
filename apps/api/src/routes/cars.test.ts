import { carListResponseSchema, carSchema, reservationListResponseSchema } from '@stylus/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCarTestApp, expectError, type CarTestApp } from '../../test/car'
import type { FamilyKey } from '../../test/family'

describe('車の API（CAR-F-001〜003・009）', () => {
  let t: CarTestApp

  beforeEach(async () => {
    t = await createCarTestApp()
  })

  afterEach(async () => {
    await t.close()
  })

  async function list(who: FamilyKey = 'seigo') {
    const res = await t.call(who, 'GET', '/cars')
    expect(res.status).toBe(200)
    return carListResponseSchema.parse(await res.json()).cars
  }

  async function names(who: FamilyKey = 'seigo') {
    return (await list(who)).map((c) => c.name)
  }

  const add = (name: string, who: FamilyKey = 'seigo') => t.call(who, 'POST', '/cars', { name })

  describe('車の一覧と登録（CAR-F-001）', () => {
    it('[CAR-F-001/AC-1] せいごが車「ノア」を登録すると、母の車の一覧に「ノア」が「使う」で出る', async () => {
      const res = await add('ノア')
      expect(res.status).toBe(201)
      expect(carSchema.parse(await res.json())).toMatchObject({ name: 'ノア', isActive: true })
      const noah = (await list('mother')).find((c) => c.name === 'ノア')
      expect(noah).toMatchObject({ isActive: true })
    })

    it('[CAR-F-001/AC-2] 名前を空白だけ（"　"）にすると登録されず「入力してください」', async () => {
      const res = await add('　')
      expect(await names()).toEqual(['BMW'])
      const error = await expectError(res, 400, 'invalid_input')
      expect(error.fields?.name).toBe('入力してください')
    })

    it('[CAR-F-001/AC-3] 「ノア」があるときに「　ノア　」を登録すると、登録されず「同じ名前の車があります」', async () => {
      await add('ノア')
      const res = await add('　ノア　')
      expect(await names()).toEqual(['BMW', 'ノア'])
      const error = await expectError(res, 409, 'duplicate_name')
      expect(error.message).toBe('同じ名前の車があります')
    })

    it('[CAR-F-001/AC-4] 「使わない」の車「ノア」があるときに「ノア」を登録すると、登録されず「同じ名前の車があります」', async () => {
      await t.insertCar('ノア', false)
      const res = await add('ノア')
      expect(await names()).toEqual(['BMW', 'ノア'])
      const error = await expectError(res, 409, 'duplicate_name')
      expect(error.message).toBe('同じ名前の車があります')
    })

    it('[CAR-F-001/AC-5] 21文字の名前は登録されず、20文字の名前は登録される', async () => {
      const res = await add('あ'.repeat(21))
      expect(await names()).toEqual(['BMW'])
      await expectError(res, 400, 'invalid_input')
      expect((await add('い'.repeat(20))).status).toBe(201)
      expect(await names()).toEqual(['BMW', 'い'.repeat(20)])
    })

    it('[CAR-F-001/AC-6] 使い始めたばかりなら、車は「BMW」（使う）だけ', async () => {
      expect(await list()).toEqual([
        {
          id: await t.carId('BMW'),
          name: 'BMW',
          isActive: true,
          hasReservations: false,
          upcomingCount: 0,
        },
      ])
    })

    // AC ではない確認
    it('名前は前後の空白を除いて保存し、名前の順に並ぶ', async () => {
      await add(' フィット ')
      await add('アクア')
      expect(await names()).toEqual(['BMW', 'アクア', 'フィット'])
    })
  })

  describe('使わない・使う（CAR-F-002）', () => {
    const setActive = (id: string, isActive: boolean, who: FamilyKey = 'mother') =>
      t.call(who, 'PATCH', `/cars/${id}`, { isActive })

    async function noah() {
      return (await list()).find((c) => c.name === 'ノア')
    }

    it('[CAR-F-002/AC-1] 母が「使う」の車「ノア」を「使わない」にすると、「ノア」は「使わない」になる', async () => {
      const car = await t.insertCar('ノア')
      const res = await setActive(car.id, false)
      expect(await noah()).toMatchObject({ isActive: false })
      expect(res.status).toBe(200)
      expect(carSchema.parse(await res.json())).toMatchObject({ name: 'ノア', isActive: false })
    })

    it('[CAR-F-002/AC-2] 「使わない」の車「ノア」を「使う」に戻すと、「ノア」は「使う」になる', async () => {
      const car = await t.insertCar('ノア', false)
      const res = await setActive(car.id, true)
      expect(await noah()).toMatchObject({ isActive: true })
      expect(res.status).toBe(200)
    })

    it('[CAR-F-002/AC-3] くうごのこれからの予約が1件ある「ノア」は、件数1と出て、「使わない」にした後も予約は10月10日を引くと出る', async () => {
      const car = await t.insertCar('ノア')
      const reservation = await t.insertReservation({
        car: 'ノア',
        who: 'kugo',
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
      })
      expect(await noah()).toMatchObject({ upcomingCount: 1, hasReservations: true })
      expect((await setActive(car.id, false)).status).toBe(200)
      const res = await t.call(
        'mother',
        'GET',
        '/car-reservations?view=range&from=2026-10-10&to=2026-10-10',
      )
      expect(res.status).toBe(200)
      const { reservations } = reservationListResponseSchema.parse(await res.json())
      expect(reservations.map((r) => r.id)).toEqual([reservation.id])
      expect(reservations[0]?.car).toMatchObject({ name: 'ノア', isActive: false })
      expect(await noah()).toMatchObject({ isActive: false, upcomingCount: 1 })
    })

    it('[CAR-F-002/AC-5] 確認を開いている間にせいごが「ノア」を削除していたら「この車は見つかりません。」', async () => {
      const car = await t.insertCar('ノア')
      await t.deleteCar(car.id)
      const error = await expectError(await setActive(car.id, false), 404, 'not_found')
      expect(error.message).toBe('この車は見つかりません。')
    })

    it('[CAR-F-002/AC-6] 確認を開いている間にせいごが「ノア」を「使わない」にしていても、母の操作はそのまま成功する', async () => {
      const car = await t.insertCar('ノア')
      expect((await setActive(car.id, false, 'seigo')).status).toBe(200)
      const res = await setActive(car.id, false)
      expect(await noah()).toMatchObject({ isActive: false })
      expect(res.status).toBe(200)
    })

    // AC ではない確認
    it('これからの予約の件数に、終わった予約は数えない', async () => {
      await t.insertCar('ノア')
      await t.insertReservation({
        car: 'ノア',
        who: 'kugo',
        from: '2026-10-07 08:00',
        to: '2026-10-07 10:00',
      })
      expect(await noah()).toMatchObject({ upcomingCount: 0, hasReservations: true })
    })

    it('ID が uuid の形でなければ 404 not_found', async () => {
      await expectError(await setActive('abc', false), 404, 'not_found')
    })
  })

  describe('名前を変える（CAR-F-009）', () => {
    const rename = (id: string, name: string, who: FamilyKey = 'mother') =>
      t.call(who, 'PATCH', `/cars/${id}`, { name })

    it('[CAR-F-009/AC-2] 名前を空白だけにして保存すると、名前は「ノア」のままで「入力してください」', async () => {
      const car = await t.insertCar('ノア')
      const res = await rename(car.id, '　 ')
      expect(await names()).toEqual(['BMW', 'ノア'])
      const error = await expectError(res, 400, 'invalid_input')
      expect(error.fields?.name).toBe('入力してください')
    })

    it('[CAR-F-009/AC-3] 「フィット」の名前を「ノア」に変えると、名前は「フィット」のままで「同じ名前の車があります」', async () => {
      await t.insertCar('ノア')
      const fit = await t.insertCar('フィット')
      const res = await rename(fit.id, 'ノア')
      expect(await names()).toEqual(['BMW', 'ノア', 'フィット'])
      const error = await expectError(res, 409, 'duplicate_name')
      expect(error.message).toBe('同じ名前の車があります')
    })

    it('[CAR-F-009/AC-4] 名前を21文字にして保存すると、名前は「ノア」のまま', async () => {
      const car = await t.insertCar('ノア')
      const res = await rename(car.id, 'あ'.repeat(21))
      expect(await names()).toEqual(['BMW', 'ノア'])
      await expectError(res, 400, 'invalid_input')
    })

    it('[CAR-F-009/AC-5] 名前を変えている間にせいごが「ノア」を削除していたら「この車は見つかりません。」', async () => {
      const car = await t.insertCar('ノア')
      await t.deleteCar(car.id)
      const error = await expectError(await rename(car.id, 'ヴォクシー'), 404, 'not_found')
      expect(error.message).toBe('この車は見つかりません。')
    })

    // AC ではない確認
    it('前後の空白を除いた名前に変わる。自分と同じ名前のまま保存しても成功する', async () => {
      const car = await t.insertCar('ノア')
      expect((await rename(car.id, ' ヴォクシー　')).status).toBe(200)
      expect(await names()).toEqual(['BMW', 'ヴォクシー'])
      const res = await rename(car.id, 'ヴォクシー')
      expect(res.status).toBe(200)
      expect(carSchema.parse(await res.json()).name).toBe('ヴォクシー')
    })

    it('名前と使う／使わないの、どちらも無い・両方ある要求は 400 で、何も変わらない（tasks.md D-4）', async () => {
      const car = await t.insertCar('ノア')
      await expectError(
        await t.call('mother', 'PATCH', `/cars/${car.id}`, {}),
        400,
        'invalid_input',
      )
      await expectError(
        await t.call('mother', 'PATCH', `/cars/${car.id}`, { name: 'ヴォクシー', isActive: false }),
        400,
        'invalid_input',
      )
      expect((await list()).find((c) => c.id === car.id)).toMatchObject({
        name: 'ノア',
        isActive: true,
      })
    })
  })

  describe('削除（CAR-F-003）', () => {
    const remove = (id: string, who: FamilyKey = 'seigo') => t.call(who, 'DELETE', `/cars/${id}`)

    // 終わった予約（今は 2026-10-07 20:00）
    const endedReservation = () =>
      t.insertReservation({
        car: 'ノア',
        who: 'kugo',
        from: '2026-10-07 08:00',
        to: '2026-10-07 10:00',
      })

    it('[CAR-F-003/AC-1] 予約が1件も入ったことのない「ノア」を削除すると、車の一覧から消える', async () => {
      const car = await t.insertCar('ノア')
      const res = await remove(car.id)
      expect(await names('mother')).toEqual(['BMW'])
      expect(res.status).toBe(204)
    })

    it('[CAR-F-003/AC-2] 終わった予約が1件だけある「ノア」は、予約がある車として返る（「削除」を出さない）', async () => {
      await t.insertCar('ノア')
      await endedReservation()
      expect((await list()).find((c) => c.name === 'ノア')).toMatchObject({
        hasReservations: true,
        upcomingCount: 0,
      })
    })

    it('[CAR-F-003/AC-3] 終わった予約が1件だけある「ノア」の削除の API を呼ぶと、409 が返り「ノア」は残る', async () => {
      const car = await t.insertCar('ノア')
      await endedReservation()
      const res = await remove(car.id)
      expect(await names()).toEqual(['BMW', 'ノア'])
      await expectError(res, 409, 'in_use')
    })

    it('[CAR-F-003/AC-4] 取り消した予約しか無い「ノア」は削除される', async () => {
      const car = await t.insertCar('ノア')
      const reservation = await t.insertReservation({
        car: 'ノア',
        who: 'kugo',
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
      })
      // 取り消した予約は行が消える
      await t.deleteReservation(reservation.id)
      const res = await remove(car.id)
      expect(await names()).toEqual(['BMW'])
      expect(res.status).toBe(204)
    })

    it('[CAR-F-003/AC-5] 削除の確認を開いている間にくうごが「ノア」を予約したら、削除されず「この車には予約があるため削除できません。使わないにしてください。」', async () => {
      const car = await t.insertCar('ノア')
      // 確認を開いた後（削除の要求の前）に、くうごが予約した
      await t.insertReservation({
        car: 'ノア',
        who: 'kugo',
        from: '2026-10-10 09:00',
        to: '2026-10-10 12:00',
      })
      const res = await remove(car.id)
      expect(await names()).toEqual(['BMW', 'ノア'])
      const error = await expectError(res, 409, 'in_use')
      expect(error.message).toBe('この車には予約があるため削除できません。使わないにしてください。')
    })

    it('[CAR-F-003/AC-7] 削除の確認を開いている間に母が「ノア」を削除していたら「この車は見つかりません。」', async () => {
      const car = await t.insertCar('ノア')
      expect((await remove(car.id, 'mother')).status).toBe(204)
      const error = await expectError(await remove(car.id), 404, 'not_found')
      expect(error.message).toBe('この車は見つかりません。')
    })
  })
})
