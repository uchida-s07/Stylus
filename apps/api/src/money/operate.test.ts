import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMoneyTestApp, type MoneyTestApp } from '../../test/money'
import { billEvents, bills } from '../db/schema'
import { ApiFailure } from '../errors'
import { operateBill } from './operate'

// 1件の操作の土台（design.md「同時の操作」、ADR-0008。AC ではない）
describe('operateBill', () => {
  let t: MoneyTestApp
  const now = new Date('2026-10-04T03:00:00Z')

  beforeEach(async () => {
    t = await createMoneyTestApp()
  })

  afterEach(async () => {
    await t.close()
  })

  async function stateOf(id: string) {
    const [row] = await t.db.select().from(bills).where(eq(bills.id, id))
    const events = await t.db.select().from(billEvents).where(eq(billEvents.billId, id))
    return { status: row?.status, version: row?.version, events: events.length }
  }

  it('状態を変え、版を1増やし、経過を1件足す', async () => {
    const bill = await t.insertBill()
    await operateBill(t.db, t.family.mother, bill.id, 'pay', { version: 1, now })
    expect(await stateOf(bill.id)).toEqual({ status: 'paid', version: 2, events: 1 })
  })

  it('版が合わなければ 409 で、状態も経過も変わらない', async () => {
    const bill = await t.insertBill()
    const error = await operateBill(t.db, t.family.mother, bill.id, 'pay', {
      version: 2,
      now,
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiFailure)
    expect((error as ApiFailure).status).toBe(409)
    expect(await stateOf(bill.id)).toEqual({ status: 'requested', version: 1, events: 0 })
  })

  it('経過の追加に失敗したら、状態の更新も巻き戻る', async () => {
    const bill = await t.insertBill()
    await t.client.exec(`
      create function fail_event() returns trigger language plpgsql as $$
      begin raise exception 'event insert failed'; end $$;
      create trigger fail_event before insert on bill_events for each row execute function fail_event();
    `)
    await expect(
      operateBill(t.db, t.family.mother, bill.id, 'pay', { version: 1, now }),
    ).rejects.toThrow()
    expect(await stateOf(bill.id)).toEqual({ status: 'requested', version: 1, events: 0 })
  })
})
