import {
  apiErrorSchema,
  billListResponseSchema,
  billDetailSchema,
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

  describe('二重登録', () => {
    it('[MONEY-F-001/AC-14] AC-1 と同じ値で「請求する」を続けて2回押しても、請求は1件だけできる', async () => {
      const input = { to: t.family.mother.id, requestId: crypto.randomUUID() }
      const [first, second] = await Promise.all([
        createBill('seigo', input),
        createBill('seigo', input),
      ])
      expect(first?.ok && second?.ok).toBe(true)
      const a = billSummarySchema.parse(await first!.json())
      const b = billSummarySchema.parse(await second!.json())
      expect(a.id).toBe(b.id)
      expect(await countBills()).toBe(1)
      expect(await listIds('mother')).toEqual([a.id])
    })

    it('[MONEY-F-001/AC-16] 3,000円 が保存された後に、同じ入力のまま金額を 3,500 に直して押すと、新しい請求は作られず「この請求はすでに登録されています。…」と出て、3,000円 の請求が1件だけある', async () => {
      const requestId = crypto.randomUUID()
      expect((await createBill('seigo', { to: t.family.mother.id, requestId })).status).toBe(201)
      const error = await expectError(
        await createBill('seigo', { to: t.family.mother.id, requestId, amount: 3500 }),
        409,
        'already_registered',
      )
      expect(error.message).toBe(
        'この請求はすでに登録されています。一覧で確かめて、必要なら直してください。',
      )
      const { bills: rows } = await list('seigo')
      expect(rows.map((b) => b.amount)).toEqual([3000])
    })
  })

  describe('一覧と合計', () => {
    // 請求を DB に直接入れる（当事者は家族の呼び名、null は「家庭」）
    function bill(
      from: FamilyKey | null,
      to: FamilyKey | null,
      amount: number,
      status: 'requested' | 'returned' | 'paid' | 'confirmed' | 'canceled' = 'requested',
      extra: { occurredOn?: string } = {},
    ) {
      return t.insertBill({
        fromMemberId: from && t.family[from].id,
        toMemberId: to && t.family[to].id,
        amount,
        status,
        ...extra,
      })
    }

    it('[MONEY-F-004/AC-1] せいごの「受け取る額の合計」5,000円・「払う額の合計」1,000円、一覧には くうご→母 を除く4件', async () => {
      const ids = [
        (await bill('seigo', 'mother', 3000)).id,
        (await bill('seigo', 'father', 2000)).id,
        (await bill('mother', 'seigo', 1000)).id,
        (await bill('seigo', null, 4000, 'paid')).id,
      ]
      await bill('kugo', 'mother', 500)

      const res = await list('seigo')
      expect(res.totals.self).toEqual({ receive: 5000, pay: 1000 })
      expect(res.totals.household).toBeNull()
      expect(res.bills.map((b) => b.id).sort()).toEqual([...ids].sort())
    })

    it('[MONEY-F-004/AC-2] 母の「払う額の合計」3,000円・「受け取る額の合計」0円・「家庭が払う額」4,000円・「家庭が受け取る額」2,000円', async () => {
      await bill('seigo', null, 4000)
      await bill('seigo', 'mother', 3000)
      await bill(null, 'kugo', 2000)

      const res = await list('mother')
      expect(res.totals.self).toEqual({ pay: 3000, receive: 0 })
      expect(res.totals.household).toEqual({ pay: 4000, receive: 2000 })
    })

    it('[MONEY-F-004/AC-3] 請求中・差し戻し・支払済・確認済・取消の5件のうち、「受け取る額の合計」に入るのは請求中の 1,000円 だけ', async () => {
      await bill('seigo', 'mother', 1000, 'requested')
      await bill('seigo', 'mother', 2000, 'returned')
      await bill('seigo', 'mother', 4000, 'paid')
      await bill('seigo', 'mother', 8000, 'confirmed')
      await bill('seigo', 'mother', 16000, 'canceled')

      expect((await list('seigo')).totals.self.receive).toBe(1000)
    })

    it('[MONEY-F-004/AC-4] くうごが関係する請求が1件も無いと、一覧は空で合計はどちらも 0円', async () => {
      await bill('seigo', 'mother', 3000)
      const res = await list('kugo')
      expect(res.bills).toEqual([])
      expect(res.totals.self).toEqual({ pay: 0, receive: 0 })
    })

    it('[MONEY-F-004/AC-5] 発生日 10/1・10/3・10/2 の3件は 10/3・10/2・10/1 の順に並ぶ', async () => {
      await bill('seigo', 'mother', 100, 'requested', { occurredOn: '2026-10-01' })
      await bill('seigo', 'mother', 300, 'requested', { occurredOn: '2026-10-03' })
      await bill('seigo', 'mother', 200, 'requested', { occurredOn: '2026-10-02' })

      const res = await list('seigo')
      expect(res.bills.map((b) => b.occurredOn)).toEqual(['2026-10-03', '2026-10-02', '2026-10-01'])
    })

    it('[MONEY-F-004/AC-6] 確認済と取消の請求は「片付いた」に出て、「片付いていない」には出ない', async () => {
      const confirmed = await bill('seigo', 'mother', 1000, 'confirmed')
      const canceled = await bill('seigo', 'mother', 2000, 'canceled')

      expect((await list('seigo', 'closed')).bills.map((b) => b.id).sort()).toEqual(
        [confirmed.id, canceled.id].sort(),
      )
      expect((await list('seigo', 'open')).bills).toEqual([])
    })

    it('[MONEY-N-001/AC-2] 母→父 の請求は、管理者のせいごの一覧に入らない', async () => {
      await bill('mother', 'father', 3000)
      const res = await list('seigo')
      expect(res.bills).toEqual([])
      expect(res.totals.self).toEqual({ pay: 0, receive: 0 })
    })

    // AC ではない確認
    it('同じ発生日なら登録の新しい順', async () => {
      const older = await bill('seigo', 'mother', 100)
      const newer = await bill('seigo', 'mother', 200)
      expect((await list('seigo')).bills.map((b) => b.id)).toEqual([newer.id, older.id])
    })

    it('view が open・closed のどちらでもなければ 400', async () => {
      const res = await t.call('seigo', 'GET', '/bills?view=all')
      await expectError(res, 400, 'invalid_input')
    })
  })

  describe('請求の中身と、関係者でなければ 404', () => {
    it('[MONEY-F-005/AC-4] 存在しない請求の ID を開くと 404 not_found', async () => {
      const res = await t.call('seigo', 'GET', `/bills/${crypto.randomUUID()}`)
      const error = await expectError(res, 404, 'not_found')
      expect(error.message).toBe('この請求は見つかりません')
    })

    it('[MONEY-N-001/AC-1] せいご→母 の請求の中身を、くうごが呼ぶと 404', async () => {
      const bill = await t.insertBill()
      await expectError(await t.call('kugo', 'GET', `/bills/${bill.id}`), 404, 'not_found')
    })

    it('[MONEY-N-001/AC-2] 母→父 の請求の中身を、管理者のせいごが呼ぶと 404', async () => {
      const bill = await t.insertBill({
        fromMemberId: t.family.mother.id,
        toMemberId: t.family.father.id,
      })
      await expectError(await t.call('seigo', 'GET', `/bills/${bill.id}`), 404, 'not_found')
    })

    it('[MONEY-N-001/AC-4] せいご→母 の請求中の請求に、くうごが「払った」「差し戻す」「直す」「取り消す」を呼ぶと、どれも 404 で請求は変わらない', async () => {
      const bill = await t.insertBill()
      const calls: [string, string, unknown][] = [
        ['POST', `/bills/${bill.id}/pay`, { version: 1 }],
        ['POST', `/bills/${bill.id}/return`, { version: 1, reason: '金額が違う' }],
        [
          'PATCH',
          `/bills/${bill.id}`,
          {
            version: 1,
            amount: 1,
            categoryId: bill.categoryId,
            title: 'x',
            occurredOn: '2026-10-04',
          },
        ],
        ['POST', `/bills/${bill.id}/cancel`, { version: 1 }],
      ]
      for (const [method, path, body] of calls) {
        await expectError(await t.call('kugo', method, path, body), 404, 'not_found')
      }
      const [row] = await t.db.select().from(bills).where(eq(bills.id, bill.id))
      expect(row).toMatchObject({ status: 'requested', version: 1, amount: 3000 })
    })

    // AC ではない確認
    it('中身には請求の項目・メモ・経過・自分の側が入る。「家庭」宛ては親なら請求先側', async () => {
      const res = await createBill('seigo', { to: 'household', memo: '保険証あり' })
      const { id } = billSummarySchema.parse(await res.json())

      const detail = billDetailSchema.parse(
        await (await t.call('father', 'GET', `/bills/${id}`)).json(),
      )
      expect(detail).toMatchObject({
        id,
        from: { name: 'せいご' },
        to: { memberId: null, name: '家庭' },
        memo: '保険証あり',
        status: 'requested',
        version: 1,
        sides: ['to'],
        events: [{ kind: 'created', actorName: 'せいご', reason: null, settlement: null }],
      })
      expect(detail.events[0]?.createdAt).toBe(NOW.toISOString())
    })

    it('ID が uuid の形でなければ 404 not_found', async () => {
      await expectError(await t.call('seigo', 'GET', '/bills/abc'), 404, 'not_found')
    })
  })

  // 請求の中身（API）
  async function detail(who: FamilyKey, id: string) {
    const res = await t.call(who, 'GET', `/bills/${id}`)
    expect(res.status).toBe(200)
    return billDetailSchema.parse(await res.json())
  }

  async function billRow(id: string) {
    const [row] = await t.db.select().from(bills).where(eq(bills.id, id))
    return row!
  }

  function eventKinds(d: { events: { kind: string; actorName: string }[] }) {
    return d.events.map((e) => `${e.kind}（${e.actorName}）`)
  }

  describe('払った（MONEY-F-006）', () => {
    const pay = (who: FamilyKey, id: string, version = 1) =>
      t.call(who, 'POST', `/bills/${id}/pay`, { version })

    it('[MONEY-F-006/AC-1] 母が せいご→母 3,000円 を「払った」にすると、支払済になり、母の「払う額の合計」から外れ、経過に「払った（母）」が残る', async () => {
      const bill = await t.insertBill({ amount: 3000 })
      expect((await list('mother')).totals.self.pay).toBe(3000)

      const res = await pay('mother', bill.id)
      expect(res.status).toBe(200)
      expect(billDetailSchema.parse(await res.json())).toMatchObject({ status: 'paid', version: 2 })
      expect((await list('mother')).totals.self.pay).toBe(0)
      expect(eventKinds(await detail('mother', bill.id))).toContain('paid（母）')
    })

    it('[MONEY-F-006/AC-3] せいご（請求する側）が「払った」の API を呼ぶと、403 で請求中のまま', async () => {
      const bill = await t.insertBill()
      await expectError(await pay('seigo', bill.id), 403, 'forbidden')
      expect(await billRow(bill.id)).toMatchObject({ status: 'requested', version: 1 })
    })

    it('[MONEY-F-006/AC-4] せいご→家庭 を父と母が同じ版で「払った」にすると、一方だけが通り、経過の「払った」は1回だけで、もう一方は 409', async () => {
      const bill = await t.insertBill({ toMemberId: null })
      const father = await pay('father', bill.id, 1)
      const mother = await pay('mother', bill.id, 1)

      expect(father.status).toBe(200)
      await expectError(mother, 409, 'state_changed')
      const d = await detail('seigo', bill.id)
      expect(d.status).toBe('paid')
      expect(d.events.filter((e) => e.kind === 'paid')).toHaveLength(1)
    })

    it('[MONEY-F-006/AC-5] 母が 3,000円 の請求を開いた後に、せいごが 2,500円 に直していたら、母の「払った」は 409 で請求中のまま、2,500円 のまま', async () => {
      const bill = await t.insertBill({ amount: 3000 })
      // 母が版 1 で開いた後に、せいごが直した（版 2）
      await t.db.update(bills).set({ amount: 2500, version: 2 }).where(eq(bills.id, bill.id))

      await expectError(await pay('mother', bill.id, 1), 409, 'state_changed')
      expect(await billRow(bill.id)).toMatchObject({ status: 'requested', amount: 2500 })
    })

    it('[MONEY-F-005/AC-2] せいご→家庭 を父が「払った」にすると、母が開いた経過に「払った（父）」と出る', async () => {
      const bill = await t.insertBill({ toMemberId: null })
      expect((await pay('father', bill.id)).status).toBe(200)
      expect(eventKinds(await detail('mother', bill.id))).toEqual(['paid（父）'])
    })

    // AC ではない確認
    it('支払済の請求の「払った」は 409（状態が違う）', async () => {
      const bill = await t.insertBill({ status: 'paid' })
      await expectError(await pay('mother', bill.id), 409, 'state_changed')
    })

    it('版が無い・形が違うと 400', async () => {
      const bill = await t.insertBill()
      await expectError(
        await t.call('mother', 'POST', `/bills/${bill.id}/pay`, {}),
        400,
        'invalid_input',
      )
    })
  })

  describe('差し戻す（MONEY-F-008）', () => {
    const giveBack = (who: FamilyKey, id: string, reason: string, version = 1) =>
      t.call(who, 'POST', `/bills/${id}/return`, { version, reason })

    it('[MONEY-F-008/AC-1] 母が理由「金額が違う」で差し戻すと、差し戻しになり、せいごの一覧で差し戻しと出て、母の「払う額の合計」から外れる', async () => {
      const bill = await t.insertBill({ amount: 3000 })
      const res = await giveBack('mother', bill.id, '金額が違う')
      expect(res.status).toBe(200)
      expect(billDetailSchema.parse(await res.json()).status).toBe('returned')

      const seigo = await list('seigo')
      expect(seigo.bills.find((b) => b.id === bill.id)?.status).toBe('returned')
      expect((await list('mother')).totals.self.pay).toBe(0)
    })

    it('[MONEY-F-008/AC-2] 理由が空白だけなら、請求中のままで「理由を入力してください」', async () => {
      const bill = await t.insertBill()
      const error = await expectError(
        await giveBack('mother', bill.id, '　 '),
        400,
        'invalid_input',
      )
      expect(error.fields?.reason).toBe('理由を入力してください')
      expect((await billRow(bill.id)).status).toBe('requested')
    })

    it('[MONEY-F-008/AC-3] 201文字の理由では請求中のまま', async () => {
      const bill = await t.insertBill()
      await expectError(await giveBack('mother', bill.id, 'あ'.repeat(201)), 400, 'invalid_input')
      expect((await billRow(bill.id)).status).toBe('requested')
    })

    it('[MONEY-F-008/AC-4] 支払済の請求を差し戻す API を呼ぶと、差し戻せず支払済のまま', async () => {
      const bill = await t.insertBill({ status: 'paid' })
      await expectError(await giveBack('mother', bill.id, '金額が違う'), 409, 'state_changed')
      expect((await billRow(bill.id)).status).toBe('paid')
    })

    it('[MONEY-F-008/AC-5] せいご（請求する側）が差し戻す API を呼ぶと、403 で請求中のまま', async () => {
      const bill = await t.insertBill()
      await expectError(await giveBack('seigo', bill.id, '金額が違う'), 403, 'forbidden')
      expect((await billRow(bill.id)).status).toBe('requested')
    })

    it('[MONEY-F-005/AC-3] 母が理由「金額が違う」で差し戻した請求を、せいごが開くと、差し戻しで、経過に「差し戻した（母）：金額が違う」と出る', async () => {
      const bill = await t.insertBill()
      expect((await giveBack('mother', bill.id, '金額が違う')).status).toBe(200)
      const d = await detail('seigo', bill.id)
      expect(d.status).toBe('returned')
      expect(d.events).toMatchObject([{ kind: 'returned', actorName: '母', reason: '金額が違う' }])
    })
  })

  describe('直す・出し直す（MONEY-F-002）', () => {
    async function edit(
      who: FamilyKey,
      bill: { id: string; categoryId: string },
      changes: Record<string, unknown> = {},
    ) {
      return t.call(who, 'PATCH', `/bills/${bill.id}`, {
        version: 1,
        amount: 3000,
        categoryId: bill.categoryId,
        title: '歯医者',
        occurredOn: '2026-10-04',
        ...changes,
      })
    }

    it('[MONEY-F-002/AC-1] せいごが 3,000円 を 2,500 に直して保存すると、2,500円・請求中のままで、経過に「直した（せいご）」が残る', async () => {
      const bill = await t.insertBill({ amount: 3000 })
      const res = await edit('seigo', bill, { amount: 2500 })
      expect(res.status).toBe(200)
      const d = billDetailSchema.parse(await res.json())
      expect(d).toMatchObject({ amount: 2500, status: 'requested', version: 2 })
      expect(eventKinds(d)).toEqual(['edited（せいご）'])
    })

    it('[MONEY-F-002/AC-2] 差し戻された請求の件名を直して「出し直す」と、請求中に戻り、経過に「出し直した」が残り、母の一覧で請求中として出る', async () => {
      const bill = await t.insertBill({ status: 'returned' })
      const res = await edit('seigo', bill, { title: '歯医者（10月分）' })
      expect(res.status).toBe(200)
      const d = billDetailSchema.parse(await res.json())
      expect(d).toMatchObject({ status: 'requested', title: '歯医者（10月分）' })
      expect(eventKinds(d)).toEqual(['resubmitted（せいご）'])
      expect((await list('mother')).bills.find((b) => b.id === bill.id)?.status).toBe('requested')
    })

    it('[MONEY-F-002/AC-3] 支払済の請求は直せず、変わらない', async () => {
      const bill = await t.insertBill({ status: 'paid' })
      await expectError(await edit('seigo', bill, { amount: 2500 }), 409, 'state_changed')
      expect(await billRow(bill.id)).toMatchObject({ status: 'paid', amount: 3000, version: 1 })
    })

    it('[MONEY-F-002/AC-4] 母（請求先）が直す API を呼ぶと、403 で請求は変わらない', async () => {
      const bill = await t.insertBill()
      await expectError(await edit('mother', bill, { amount: 100 }), 403, 'forbidden')
      expect(await billRow(bill.id)).toMatchObject({ amount: 3000, version: 1 })
    })

    it('[MONEY-F-002/AC-5] せいごが直す画面を開いている間に母が「払った」にしていたら、保存は 409 で金額などは変わらない', async () => {
      const bill = await t.insertBill()
      expect((await t.call('mother', 'POST', `/bills/${bill.id}/pay`, { version: 1 })).status).toBe(
        200,
      )
      await expectError(await edit('seigo', bill, { amount: 2500 }), 409, 'state_changed')
      expect(await billRow(bill.id)).toMatchObject({ status: 'paid', amount: 3000 })
    })

    it('[MONEY-F-002/AC-6] 母が登録した 家庭→くうご の請求を、父が直すと保存され、経過に「直した（父）」が残る', async () => {
      const bill = await t.insertBill({ fromMemberId: null, toMemberId: t.family.kugo.id })
      const res = await edit('father', bill, { amount: 4000 })
      expect(res.status).toBe(200)
      expect(eventKinds(billDetailSchema.parse(await res.json()))).toEqual(['edited（父）'])
    })

    it('[MONEY-F-002/AC-7] 件名を空白だけにして保存すると、保存されず件名は「歯医者」のまま', async () => {
      const bill = await t.insertBill()
      await expectError(await edit('seigo', bill, { title: '　' }), 400, 'invalid_input')
      expect((await billRow(bill.id)).title).toBe('歯医者')
    })

    it('[MONEY-F-002/AC-8] 金額を 0 に直して保存すると、保存されず 3,000円 のまま', async () => {
      const bill = await t.insertBill()
      await expectError(await edit('seigo', bill, { amount: 0 }), 400, 'invalid_input')
      expect((await billRow(bill.id)).amount).toBe(3000)
    })

    // AC ではない確認
    it('削除されたカテゴリーに直すと 400（「カテゴリーが見つかりません。選び直してください」）', async () => {
      const bill = await t.insertBill()
      const error = await expectError(
        await edit('seigo', bill, { categoryId: crypto.randomUUID() }),
        400,
        'invalid_input',
      )
      expect(error.fields?.categoryId).toBe('カテゴリーが見つかりません。選び直してください')
    })
  })

  describe('取り消す（MONEY-F-003）', () => {
    const cancel = (who: FamilyKey, id: string, version = 1) =>
      t.call(who, 'POST', `/bills/${id}/cancel`, { version })

    it('[MONEY-F-003/AC-1] せいごが せいご→母 3,000円 を取り消すと、取消になり、せいごの「受け取る額の合計」と母の「払う額の合計」から外れる', async () => {
      const bill = await t.insertBill({ amount: 3000 })
      const res = await cancel('seigo', bill.id)
      expect(res.status).toBe(200)
      expect(billDetailSchema.parse(await res.json()).status).toBe('canceled')
      expect((await list('seigo')).totals.self.receive).toBe(0)
      expect((await list('mother')).totals.self.pay).toBe(0)
    })

    it('[MONEY-F-003/AC-3] 支払済の請求を取り消す API を呼ぶと、取り消せず支払済のまま', async () => {
      const bill = await t.insertBill({ status: 'paid' })
      await expectError(await cancel('seigo', bill.id), 409, 'state_changed')
      expect((await billRow(bill.id)).status).toBe('paid')
    })

    it('[MONEY-F-003/AC-4] 母（請求先）が取り消す API を呼ぶと、403 で請求中のまま', async () => {
      const bill = await t.insertBill()
      await expectError(await cancel('mother', bill.id), 403, 'forbidden')
      expect((await billRow(bill.id)).status).toBe('requested')
    })

    it('[MONEY-F-003/AC-5] すでに取消の請求をもう一度取り消す API を呼ぶと、取り消せず、経過の「取り消した」は1回だけ', async () => {
      const bill = await t.insertBill()
      expect((await cancel('seigo', bill.id, 1)).status).toBe(200)
      await expectError(await cancel('seigo', bill.id, 2), 409, 'state_changed')
      const d = await detail('seigo', bill.id)
      expect(d.events.filter((e) => e.kind === 'canceled')).toHaveLength(1)
    })

    // AC ではない確認
    it('差し戻しの請求も取り消せる', async () => {
      const bill = await t.insertBill({ status: 'returned' })
      expect((await cancel('seigo', bill.id)).status).toBe(200)
      expect((await billRow(bill.id)).status).toBe('canceled')
    })
  })

  describe('受け取った（MONEY-F-007）', () => {
    const confirm = (who: FamilyKey, id: string, version = 1) =>
      t.call(who, 'POST', `/bills/${id}/confirm`, { version })

    it('[MONEY-F-007/AC-1] 1件ずつ払われた せいご→母 の支払済の請求を、せいごが「受け取った」にすると、確認済になり「片付いた」側に出る', async () => {
      const bill = await t.insertBill({ status: 'paid' })
      const res = await confirm('seigo', bill.id)
      expect(res.status).toBe(200)
      expect(billDetailSchema.parse(await res.json()).status).toBe('confirmed')
      expect((await list('seigo', 'closed')).bills.map((b) => b.id)).toEqual([bill.id])
      expect((await list('seigo', 'open')).bills).toEqual([])
    })

    it('[MONEY-F-007/AC-2] 請求中の請求に「受け取った」の API を呼ぶと、受け取れず請求中のまま', async () => {
      const bill = await t.insertBill()
      await expectError(await confirm('seigo', bill.id), 409, 'state_changed')
      expect((await billRow(bill.id)).status).toBe('requested')
    })

    it('[MONEY-F-007/AC-3] 母（請求先）が「受け取った」の API を呼ぶと、403 で支払済のまま', async () => {
      const bill = await t.insertBill({ status: 'paid' })
      await expectError(await confirm('mother', bill.id), 403, 'forbidden')
      expect((await billRow(bill.id)).status).toBe('paid')
    })

    it('[MONEY-F-007/AC-5] 母が登録した 家庭→くうご の支払済の請求を、父が「受け取った」にすると、確認済になり、経過に「受け取った（父）」が残る', async () => {
      const bill = await t.insertBill({
        fromMemberId: null,
        toMemberId: t.family.kugo.id,
        status: 'paid',
      })
      const res = await confirm('father', bill.id)
      expect(res.status).toBe(200)
      const d = billDetailSchema.parse(await res.json())
      expect(d.status).toBe('confirmed')
      expect(eventKinds(d)).toEqual(['confirmed（父）'])
    })

    it('[MONEY-F-005/AC-1] せいごが 10/1 10:00 に登録し、母が 10/2 20:00 に「払った」、せいごが 10/3 08:00 に「受け取った」にした請求の経過が、この順に日時とともに出る', async () => {
      now = new Date('2026-10-01T01:00:00Z') // 日本時間 10/1 10:00
      const created = await createBill('seigo', {
        to: t.family.mother.id,
        occurredOn: '2026-10-01',
      })
      const { id } = billSummarySchema.parse(await created.json())
      now = new Date('2026-10-02T11:00:00Z') // 10/2 20:00
      expect((await t.call('mother', 'POST', `/bills/${id}/pay`, { version: 1 })).status).toBe(200)
      now = new Date('2026-10-02T23:00:00Z') // 10/3 08:00
      expect((await confirm('seigo', id, 2)).status).toBe(200)

      const d = await detail('seigo', id)
      expect(d.events.map((e) => [e.kind, e.actorName, e.createdAt])).toEqual([
        ['created', 'せいご', '2026-10-01T01:00:00.000Z'],
        ['paid', '母', '2026-10-02T11:00:00.000Z'],
        ['confirmed', 'せいご', '2026-10-02T23:00:00.000Z'],
      ])
    })
  })

  describe('支払済を請求中へ戻す（MONEY-F-009、1件ずつ）', () => {
    const revert = (who: FamilyKey, id: string, version = 2) =>
      t.call(who, 'POST', `/bills/${id}/revert`, { version })

    // 母が「払った」にした せいご→母 3,000円（版 2）
    async function paidByMother() {
      const bill = await t.insertBill({ amount: 3000 })
      expect((await t.call('mother', 'POST', `/bills/${bill.id}/pay`, { version: 1 })).status).toBe(
        200,
      )
      return bill
    }

    it('[MONEY-F-009/AC-1] 母が「払ったを取り消す」を選ぶと、請求中に戻り、母の「払う額の合計」に戻り、経過に「払ったを取り消した（母）」が残る', async () => {
      const bill = await paidByMother()
      const res = await revert('mother', bill.id)
      expect(res.status).toBe(200)
      const d = billDetailSchema.parse(await res.json())
      expect(d.status).toBe('requested')
      expect(eventKinds(d)).toEqual(['paid（母）', 'payment_canceled（母）'])
      expect((await list('mother')).totals.self.pay).toBe(3000)
    })

    it('[MONEY-F-009/AC-2] せいごが「受け取っていない」を選ぶと、請求中に戻り、経過に「受け取っていない（せいご）」が残る', async () => {
      const bill = await paidByMother()
      const res = await revert('seigo', bill.id)
      expect(res.status).toBe(200)
      const d = billDetailSchema.parse(await res.json())
      expect(d.status).toBe('requested')
      expect(eventKinds(d)).toEqual(['paid（母）', 'not_received（せいご）'])
    })

    it('[MONEY-F-009/AC-4] 確認済の請求に「受け取っていない」の API を呼ぶと、戻せず確認済のまま', async () => {
      const bill = await t.insertBill({ status: 'confirmed' })
      await expectError(await revert('seigo', bill.id, 1), 409, 'state_changed')
      expect((await billRow(bill.id)).status).toBe('confirmed')
    })
  })
})
