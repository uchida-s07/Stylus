import {
  apiErrorSchema,
  billDetailSchema,
  billListResponseSchema,
  settlementPreviewSchema,
  type SettlementPreview,
} from '@stylus/shared'
import { count, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FamilyKey } from '../../test/family'
import { createMoneyTestApp, type MoneyTestApp } from '../../test/money'
import { bills, settlements } from '../db/schema'

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

  // 精算の画面で見ていたとおりに「まとめて払った」を送る
  function payAll(
    who: FamilyKey,
    counterpart: FamilyKey | 'household',
    p: SettlementPreview,
    as: 'self' | 'household' = 'self',
  ) {
    return t.call(who, 'POST', '/settlements', {
      as,
      counterpart: counterpartOf(counterpart),
      bills: p.bills.map((b) => ({ id: b.id, version: b.version })),
      amount: p.amount,
      payer: p.payer ?? 'self',
    })
  }

  async function statusOf(id: string) {
    const [row] = await t.db.select().from(bills).where(eq(bills.id, id))
    return row?.status
  }

  async function countSettlements() {
    const [row] = await t.db.select({ n: count() }).from(settlements)
    return row?.n
  }

  async function pendingOf(who: FamilyKey) {
    const res = await t.call(who, 'GET', '/bills')
    return billListResponseSchema.parse(await res.json()).pendingSettlements
  }

  // MONEY-F-010/AC-1 の請求（請求中の3件、差し戻し・支払済が1件ずつ）
  async function f010ac1Bills() {
    return {
      requested: [
        await bill('seigo', 'mother', 3000),
        await bill('seigo', 'mother', 500),
        await bill('mother', 'seigo', 1000),
      ],
      returned: await bill('seigo', 'mother', 800, 'returned'),
      paid: await bill('seigo', 'mother', 700, 'paid'),
    }
  }

  // 精算に入った請求を DB に直接用意する（母がせいごに 2,000円）
  async function settledBills() {
    const [s] = await t.db
      .insert(settlements)
      .values({
        payerMemberId: t.family.mother.id,
        receiverMemberId: t.family.seigo.id,
        amount: 2000,
        paidBy: t.family.mother.id,
        paidAt: NOW,
      })
      .returning()
    const a = await t.insertBill({ amount: 3000, status: 'paid', settlementId: s!.id, version: 2 })
    return { settlement: s!, bill: a }
  }

  describe('まとめて払った（MONEY-F-011）', () => {
    it('[MONEY-F-011/AC-1] 母が相手「せいご」の精算（母がせいごに 2,500円）で「まとめて払った」にすると、請求中の3件が支払済になり、せいごの一覧に受け取り待ちの精算「母から 2,500円」が出る。差し戻しと支払済は変わらない', async () => {
      const given = await f010ac1Bills()
      const p = await previewOk('mother', 'seigo')
      expect(p).toMatchObject({ amount: 2500, payer: 'self' })

      const res = await payAll('mother', 'seigo', p)
      expect(res.status).toBe(201)
      for (const b of given.requested) expect(await statusOf(b.id)).toBe('paid')
      expect(await statusOf(given.returned.id)).toBe('returned')
      expect(await statusOf(given.paid.id)).toBe('paid')
      expect(await pendingOf('seigo')).toMatchObject([
        { payer: { name: '母' }, receiver: { name: 'せいご' }, amount: 2500, side: 'receiver' },
      ])
    })

    it('[MONEY-F-011/AC-3] せいご（受け取る側）が「まとめて払った」の API を呼ぶと、403 で3件とも請求中のまま', async () => {
      const given = await f010ac1Bills()
      const p = await previewOk('seigo', 'mother')
      expect(p.payer).toBe('counterpart')

      await expectError(await payAll('seigo', 'mother', p), 403, 'forbidden')
      for (const b of given.requested) expect(await statusOf(b.id)).toBe('requested')
      expect(await countSettlements()).toBe(0)
    })

    it('[MONEY-F-011/AC-5] 差し引き 0円 で、せいごが「まとめて払った」にすると、2件とも支払済になり、母の一覧に受け取り待ちの精算「せいごから 0円」が出る', async () => {
      const a = await bill('seigo', 'mother', 1000)
      const b = await bill('mother', 'seigo', 1000)
      const p = await previewOk('seigo', 'mother')
      expect(p).toMatchObject({ amount: 0, payer: null })

      expect((await payAll('seigo', 'mother', p)).status).toBe(201)
      expect(await statusOf(a.id)).toBe('paid')
      expect(await statusOf(b.id)).toBe('paid')
      expect(await pendingOf('mother')).toMatchObject([
        { payer: { name: 'せいご' }, amount: 0, side: 'receiver' },
      ])
    })

    it('[MONEY-F-011/AC-6] くうごと父の間に請求中の請求が無いときに「まとめて払った」の API を呼ぶと、精算は作られない', async () => {
      const p = await previewOk('kugo', 'father')
      const res = await payAll('kugo', 'father', p)
      expect(res.status).toBe(400)
      expect(await countSettlements()).toBe(0)
    })

    it('[MONEY-F-005/AC-5] 精算（母がせいごに 2,000円）でまとめて払われた請求を、せいごが開くと、経過に精算でまとめて払ったこと・精算の相手（母）・精算額（2,000円）が出る', async () => {
      const a = await bill('seigo', 'mother', 3000)
      await bill('mother', 'seigo', 1000)
      const p = await previewOk('mother', 'seigo')
      expect((await payAll('mother', 'seigo', p)).status).toBe(201)

      const res = await t.call('seigo', 'GET', `/bills/${a.id}`)
      const d = billDetailSchema.parse(await res.json())
      expect(d.events).toMatchObject([
        {
          kind: 'settled_paid',
          actorName: '母',
          settlement: { amount: 2000, payer: { name: '母' } },
        },
      ])
    })

    it('[MONEY-F-007/AC-4] 精算でまとめて払われた せいご→母 の請求を、せいごがその1件だけ「受け取った」にしようとすると、受け取れず支払済のまま', async () => {
      const { bill: settled } = await settledBills()
      await expectError(
        await t.call('seigo', 'POST', `/bills/${settled.id}/confirm`, { version: 2 }),
        409,
        'state_changed',
      )
      expect(await statusOf(settled.id)).toBe('paid')
    })

    it('[MONEY-F-009/AC-5] 精算に含まれる せいご→母 の請求を、せいごがその1件だけ戻そうとすると、戻せず支払済のまま', async () => {
      const { bill: settled } = await settledBills()
      await expectError(
        await t.call('seigo', 'POST', `/bills/${settled.id}/revert`, { version: 2 }),
        409,
        'state_changed',
      )
      expect(await statusOf(settled.id)).toBe('paid')
    })

    // AC ではない確認
    it('「家庭」の名義でも払える（家庭がせいごに 2,500円 を父が払う）', async () => {
      await bill('seigo', null, 4000)
      await bill(null, 'seigo', 1500)
      const p = await previewOk('father', 'seigo', 'household')
      expect(p).toMatchObject({ amount: 2500, payer: 'self' })
      expect((await payAll('father', 'seigo', p, 'household')).status).toBe(201)
      expect(await pendingOf('mother')).toMatchObject([
        { payer: { memberId: null, name: '家庭' }, amount: 2500, side: 'payer' },
      ])
    })
  })

  // テストの中で、請求の更新を n 件目で失敗させる（本物のトランザクションが巻き戻ることを見る）
  async function failBillUpdateAt(n: number) {
    await t.client.exec(`
      create sequence bill_update_count;
      create function fail_bill_update() returns trigger language plpgsql as $$
      begin
        if nextval('bill_update_count') = ${n} then raise exception 'bill update failed'; end if;
        return new;
      end $$;
      create trigger fail_bill_update before update on bills for each row execute function fail_bill_update();
    `)
  }

  describe('まとめて払ったの競合と失敗（MONEY-F-011）', () => {
    it('[MONEY-F-011/AC-4] 母が精算を開いた後に、せいごが せいご→母 1,000円 を新しく請求していたら、どの請求も変わらず 409 で、精算額は「母がせいごに 3,500円」になる', async () => {
      const given = await f010ac1Bills()
      const p = await previewOk('mother', 'seigo')
      const added = await bill('seigo', 'mother', 1000)

      await expectError(await payAll('mother', 'seigo', p), 409, 'state_changed')
      for (const b of [...given.requested, added]) expect(await statusOf(b.id)).toBe('requested')
      expect(await countSettlements()).toBe(0)
      expect(await previewOk('mother', 'seigo')).toMatchObject({ amount: 3500, payer: 'self' })
    })

    it('[MONEY-F-011/AC-7] 3件を支払済にする途中で保存に失敗すると、3件とも請求中のままで、精算は作られない', async () => {
      const given = await f010ac1Bills()
      const p = await previewOk('mother', 'seigo')
      await failBillUpdateAt(2)

      const res = await payAll('mother', 'seigo', p)
      expect(res.status).toBe(500)
      for (const b of given.requested) expect(await statusOf(b.id)).toBe('requested')
      expect(await countSettlements()).toBe(0)
    })

    // AC ではない確認（design.md「同時の操作」の手順2・3）
    it('見ていた請求の版が古い（開いた後に直された）と 409', async () => {
      const given = await f010ac1Bills()
      const p = await previewOk('mother', 'seigo')
      await t.db
        .update(bills)
        .set({ amount: 3100, version: 2 })
        .where(eq(bills.id, given.requested[0]!.id))
      await expectError(await payAll('mother', 'seigo', p), 409, 'state_changed')
      expect(await countSettlements()).toBe(0)
    })

    it('精算額が見ていたものと違うと 409', async () => {
      await f010ac1Bills()
      const p = await previewOk('mother', 'seigo')
      await expectError(
        await payAll('mother', 'seigo', { ...p, amount: 2000 }),
        409,
        'state_changed',
      )
      expect(await countSettlements()).toBe(0)
    })
  })
})
