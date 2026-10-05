import { billListResponseSchema, billSummarySchema, type BillInput } from '@stylus/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FamilyKey } from '../../test/family'
import { createMoneyTestApp, type MoneyTestApp } from '../../test/money'

// 日本時間 2026-10-04 12:00
const NOW = new Date('2026-10-04T03:00:00Z')

describe('請求の API', () => {
  let t: MoneyTestApp

  beforeEach(async () => {
    t = await createMoneyTestApp({ now: () => NOW })
  })

  afterEach(async () => {
    await t.close()
  })

  // 請求を登録する（API を通す）
  async function createBill(who: FamilyKey, input: Partial<BillInput> & Pick<BillInput, 'to'>) {
    return t.call(who, 'POST', '/bills', {
      amount: 3000,
      categoryId: await t.categoryId('医療費'),
      title: '歯医者',
      occurredOn: '2026-10-04',
      requestId: crypto.randomUUID(),
      ...input,
    })
  }

  async function list(who: FamilyKey, view: 'open' | 'closed' = 'open') {
    const res = await t.call(who, 'GET', `/bills?view=${view}`)
    expect(res.status).toBe(200)
    return billListResponseSchema.parse(await res.json())
  }

  async function listIds(who: FamilyKey) {
    return (await list(who)).bills.map((b) => b.id)
  }

  describe('登録と一覧の基本', () => {
    it('[MONEY-F-001/AC-1] せいごが母に 3,000円「歯医者」を請求すると、請求中の請求が1件でき、せいごと母の一覧に出て、父とくうごの一覧には出ない', async () => {
      const res = await createBill('seigo', {
        to: t.family.mother.id,
        amount: 3000,
        categoryId: await t.categoryId('医療費'),
        title: '歯医者',
        occurredOn: '2026-10-04',
      })
      expect(res.status).toBe(201)
      const bill = billSummarySchema.parse(await res.json())
      expect(bill).toMatchObject({
        from: { memberId: t.family.seigo.id, name: 'せいご' },
        to: { memberId: t.family.mother.id, name: '母' },
        amount: 3000,
        category: { name: '医療費' },
        title: '歯医者',
        occurredOn: '2026-10-04',
        status: 'requested',
        version: 1,
      })

      expect(await listIds('seigo')).toEqual([bill.id])
      expect(await listIds('mother')).toEqual([bill.id])
      expect(await listIds('father')).toEqual([])
      expect(await listIds('kugo')).toEqual([])
    })

    it('[MONEY-F-001/AC-2] 母が「家庭」としてくうごに 5,000円「スマホの修理代」を請求すると、請求する側が「家庭」の請求中の請求ができ、母・父・くうごの一覧に出る', async () => {
      const res = await createBill('mother', {
        as: 'household',
        to: t.family.kugo.id,
        amount: 5000,
        categoryId: await t.categoryId('日用品'),
        title: 'スマホの修理代',
      })
      expect(res.status).toBe(201)
      const bill = billSummarySchema.parse(await res.json())
      expect(bill).toMatchObject({
        from: { memberId: null, name: '家庭' },
        to: { memberId: t.family.kugo.id, name: 'くうご' },
        status: 'requested',
      })

      expect(await listIds('mother')).toEqual([bill.id])
      expect(await listIds('father')).toEqual([bill.id])
      expect(await listIds('kugo')).toEqual([bill.id])
      expect(await listIds('seigo')).toEqual([])
    })

    it('[MONEY-N-001/AC-3] せいご→家庭 の請求は、父の一覧に入っている', async () => {
      const res = await createBill('seigo', { to: 'household' })
      expect(res.status).toBe(201)
      const bill = billSummarySchema.parse(await res.json())
      expect(bill.to).toEqual({ memberId: null, name: '家庭' })
      expect(await listIds('father')).toContain(bill.id)
    })

    // AC ではない確認
    it('登録すると経過に「登録」が1件残り、メモは前後の空白を除いて保存される', async () => {
      const res = await createBill('seigo', { to: t.family.mother.id, memo: ' 保険証あり ' })
      const bill = billSummarySchema.parse(await res.json())
      const [row] = await t.db.query.bills.findMany({ where: (b, { eq }) => eq(b.id, bill.id) })
      expect(row?.memo).toBe('保険証あり')
      const events = await t.db.query.billEvents.findMany({
        where: (e, { eq }) => eq(e.billId, bill.id),
      })
      expect(events).toMatchObject([{ kind: 'created', actorMemberId: t.family.seigo.id }])
    })
  })
})
