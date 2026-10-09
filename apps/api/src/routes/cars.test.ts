import { carListResponseSchema, carSchema } from '@stylus/shared'
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
})
