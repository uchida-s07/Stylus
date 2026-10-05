import {
  apiErrorSchema,
  billListResponseSchema,
  billSummarySchema,
  type BillInput,
} from '@stylus/shared'
import { count, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FamilyKey } from '../../test/family'
import { createMoneyTestApp, type MoneyTestApp } from '../../test/money'
import { billCategories, bills } from '../db/schema'

// 日本時間 2026-10-04 12:00
const NOW = new Date('2026-10-04T03:00:00Z')

describe('請求の API', () => {
  let t: MoneyTestApp
  // 「今」（テストごとに差し替えられる）
  let now = NOW

  beforeEach(async () => {
    now = NOW
    t = await createMoneyTestApp({ now: () => now })
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

  async function countBills() {
    const [row] = await t.db.select({ n: count() }).from(bills)
    return row?.n
  }

  async function expectError(res: Response, status: number, code: string) {
    expect(res.status).toBe(status)
    const body = apiErrorSchema.parse(await res.json())
    expect(body.error.code).toBe(code)
    return body.error
  }

  // 登録が 400 で止まり、請求が作られないこと
  async function expectNotCreated(res: Response, field?: string, message?: string) {
    const error = await expectError(res, 400, 'invalid_input')
    if (field) expect(error.fields?.[field]).toEqual(message ?? expect.any(String))
    expect(await countBills()).toBe(0)
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

  describe('登録の入力の検証', () => {
    it('[MONEY-F-001/AC-3] 件名が空白だけなら、請求は作られず件名に「入力してください」', async () => {
      await expectNotCreated(
        await createBill('seigo', { to: t.family.mother.id, title: '　 ' }),
        'title',
        '入力してください',
      )
    })

    it.each([0, 10_000_000, 1.5, -100])(
      '[MONEY-F-001/AC-4] 金額 %d では請求は作られない',
      async (amount) => {
        await expectNotCreated(
          await createBill('seigo', { to: t.family.mother.id, amount }),
          'amount',
          '1円以上9,999,999円以下の整数で入力してください',
        )
      },
    )

    it.each([1, 9_999_999])(
      '[MONEY-F-001/AC-5] 金額 %d なら請求中の請求ができる',
      async (amount) => {
        const res = await createBill('seigo', { to: t.family.mother.id, amount })
        expect(res.status).toBe(201)
        expect(billSummarySchema.parse(await res.json())).toMatchObject({
          amount,
          status: 'requested',
        })
      },
    )

    it('[MONEY-F-001/AC-6] 日本時間 2026-10-04 23:59 に発生日 2026-10-05 で請求すると、請求は作られない', async () => {
      now = new Date('2026-10-04T14:59:00Z')
      await expectNotCreated(
        await createBill('seigo', { to: t.family.mother.id, occurredOn: '2026-10-05' }),
        'occurredOn',
        '今日より後の日付は選べません',
      )
    })

    it('[MONEY-F-001/AC-7] 請求先を自分にすると、請求は作られない', async () => {
      await expectNotCreated(
        await createBill('seigo', { to: t.family.seigo.id }),
        'to',
        '自分には請求できません',
      )
    })

    it('[MONEY-F-001/AC-8] 母が請求先を「家庭」にすると、請求は作られない', async () => {
      await expectNotCreated(
        await createBill('mother', { to: 'household' }),
        'to',
        '親は「家庭」に請求できません',
      )
    })

    it('[MONEY-F-001/AC-9] 父が「家庭」として母に請求すると、請求は作られない', async () => {
      await expectNotCreated(
        await createBill('father', { as: 'household', to: t.family.mother.id }),
        'to',
        '「家庭」の請求先は息子だけです',
      )
    })

    it('[MONEY-F-001/AC-10] 親でないせいごが「家庭」として登録の API を呼ぶと、403 が返り請求は作られない', async () => {
      await expectError(
        await createBill('seigo', { as: 'household', to: t.family.kugo.id }),
        403,
        'forbidden',
      )
      expect(await countBills()).toBe(0)
    })

    it('[MONEY-F-001/AC-11] 選んだカテゴリー「食費」が削除されていたら、請求は作られず「カテゴリーが見つかりません。選び直してください」', async () => {
      const id = await t.categoryId('食費')
      await t.db.delete(billCategories).where(eq(billCategories.id, id))
      await expectNotCreated(
        await createBill('seigo', { to: t.family.mother.id, categoryId: id }),
        'categoryId',
        'カテゴリーが見つかりません。選び直してください',
      )
    })

    it('[MONEY-F-001/AC-15] 件名51文字・メモ501文字では作られず、件名50文字・メモ500文字なら作られる', async () => {
      const to = t.family.mother.id
      await expectNotCreated(await createBill('seigo', { to, title: 'あ'.repeat(51) }), 'title')
      await expectNotCreated(await createBill('seigo', { to, memo: 'あ'.repeat(501) }), 'memo')
      const res = await createBill('seigo', { to, title: 'あ'.repeat(50), memo: 'い'.repeat(500) })
      expect(res.status).toBe(201)
    })

    it('[MONEY-F-001/AC-17] 日本時間 2026-10-05 00:30（UTC 2026-10-04 15:30）に発生日 2026-10-05 で請求すると、請求中の請求ができる', async () => {
      now = new Date('2026-10-04T15:30:00Z')
      const res = await createBill('seigo', { to: t.family.mother.id, occurredOn: '2026-10-05' })
      expect(res.status).toBe(201)
      expect(billSummarySchema.parse(await res.json()).status).toBe('requested')
    })

    it('[MONEY-F-001/AC-18] 発生日 2019-12-31 では作られず、2020-01-01 なら作られる', async () => {
      const to = t.family.mother.id
      await expectNotCreated(
        await createBill('seigo', { to, occurredOn: '2019-12-31' }),
        'occurredOn',
        '2020-01-01 以降の日付を選んでください',
      )
      expect((await createBill('seigo', { to, occurredOn: '2020-01-01' })).status).toBe(201)
    })

    // AC ではない確認（tasks.md D-2）
    it('存在しない家族の ID は 400（請求先に「選び直してください」）', async () => {
      await expectNotCreated(
        await createBill('seigo', { to: crypto.randomUUID() }),
        'to',
        '選び直してください',
      )
    })

    it('判定の順：親でない家族が「家庭」の名義で請求先「父」を選んだら 403', async () => {
      await expectError(
        await createBill('seigo', { as: 'household', to: t.family.father.id }),
        403,
        'forbidden',
      )
    })

    it('親は「家庭」として息子に、息子は「家庭」に請求できる', async () => {
      expect((await createBill('father', { as: 'household', to: t.family.seigo.id })).status).toBe(
        201,
      )
      expect((await createBill('kugo', { to: 'household' })).status).toBe(201)
    })
  })
})
