import { apiErrorSchema, settlementPreviewSchema } from '@stylus/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FamilyKey } from '../../test/family'
import { createMoneyTestApp, type MoneyTestApp } from '../../test/money'

const NOW = new Date('2026-10-04T03:00:00Z')

describe('精算の API', () => {
  let t: MoneyTestApp
  let now = NOW

  beforeEach(async () => {
    now = NOW
    t = await createMoneyTestApp({ now: () => now })
  })

  afterEach(async () => {
    await t.close()
  })

  type Status = 'requested' | 'returned' | 'paid' | 'confirmed' | 'canceled'

  // 請求を DB に直接入れる（null は「家庭」）
  function bill(
    from: FamilyKey | null,
    to: FamilyKey | null,
    amount: number,
    status: Status = 'requested',
  ) {
    return t.insertBill({
      fromMemberId: from && t.family[from].id,
      toMemberId: to && t.family[to].id,
      amount,
      status,
    })
  }

  async function expectError(res: Response, status: number, code: string) {
    expect(res.status).toBe(status)
    const body = apiErrorSchema.parse(await res.json())
    expect(body.error.code).toBe(code)
    return body.error
  }

  function counterpartOf(c: FamilyKey | 'household') {
    return c === 'household' ? 'household' : t.family[c].id
  }

  function preview(
    who: FamilyKey,
    counterpart: FamilyKey | 'household',
    as: 'self' | 'household' = 'self',
  ) {
    return t.call(
      who,
      'GET',
      `/settlements/preview?as=${as}&counterpart=${counterpartOf(counterpart)}`,
    )
  }

  async function previewOk(
    who: FamilyKey,
    counterpart: FamilyKey | 'household',
    as: 'self' | 'household' = 'self',
  ) {
    const res = await preview(who, counterpart, as)
    expect(res.status).toBe(200)
    return settlementPreviewSchema.parse(await res.json())
  }

  describe('精算額（MONEY-F-010）', () => {
    it('[MONEY-F-010/AC-1] せいごが相手「母」の精算を開くと、せいご→母 の小計 3,500円、母→せいご の小計 1,000円、精算額「母がせいごに 2,500円」', async () => {
      await bill('seigo', 'mother', 3000)
      await bill('seigo', 'mother', 500)
      await bill('mother', 'seigo', 1000)
      await bill('seigo', 'mother', 800, 'returned')
      await bill('seigo', 'mother', 700, 'paid')

      const p = await previewOk('seigo', 'mother')
      expect(p).toMatchObject({
        self: { memberId: t.family.seigo.id, name: 'せいご' },
        counterpart: { memberId: t.family.mother.id, name: '母' },
        selfRequestedTotal: 3500,
        counterpartRequestedTotal: 1000,
        amount: 2500,
        payer: 'counterpart',
      })
      expect(p.bills).toHaveLength(3)
    })

    it('[MONEY-F-010/AC-2] 母が名義「家庭」・相手「せいご」の精算を開くと「家庭がせいごに 2,500円」で、せいご→母 は入らない', async () => {
      await bill('seigo', null, 4000)
      await bill(null, 'seigo', 1500)
      const toMother = await bill('seigo', 'mother', 3000)

      const p = await previewOk('mother', 'seigo', 'household')
      expect(p).toMatchObject({
        self: { memberId: null, name: '家庭' },
        counterpart: { name: 'せいご' },
        amount: 2500,
        payer: 'self',
      })
      expect(p.bills.map((b) => b.id)).not.toContain(toMother.id)
      expect(p.bills).toHaveLength(2)
    })

    it('[MONEY-F-010/AC-5] 親でないせいごが名義「家庭」で精算額の API を呼ぶと 403', async () => {
      await expectError(await preview('seigo', 'kugo', 'household'), 403, 'forbidden')
    })

    it('[MONEY-F-010/AC-6] せいごが相手を自分にして精算額の API を呼ぶと、精算額は返らず 400', async () => {
      await expectError(await preview('seigo', 'seigo'), 400, 'invalid_input')
    })

    it('[MONEY-F-010/AC-7] 母が名義「自分」・相手「家庭」、名義「家庭」・相手「父」で呼ぶと、どちらも 400', async () => {
      await expectError(await preview('mother', 'household'), 400, 'invalid_input')
      await expectError(await preview('mother', 'father', 'household'), 400, 'invalid_input')
    })

    // AC ではない確認
    it('請求が無ければ 0円 で、払う側は決まらない', async () => {
      expect(await previewOk('kugo', 'father')).toMatchObject({ bills: [], amount: 0, payer: null })
    })

    it('存在しない家族の ID は 400（相手に「選び直してください」）', async () => {
      const res = await t.call(
        'seigo',
        'GET',
        `/settlements/preview?counterpart=${crypto.randomUUID()}`,
      )
      const error = await expectError(res, 400, 'invalid_input')
      expect(error.fields?.counterpart).toBe('選び直してください')
    })

    it('息子は「家庭」を相手に選べる', async () => {
      await bill('kugo', null, 700)
      expect(await previewOk('kugo', 'household')).toMatchObject({
        amount: 700,
        payer: 'counterpart',
      })
    })
  })
})
