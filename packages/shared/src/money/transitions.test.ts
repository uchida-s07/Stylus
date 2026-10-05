import { describe, expect, it } from 'vitest'
import {
  BILL_ACTIONS,
  BILL_STATUSES,
  availableBillActions,
  availableSettlementActions,
  billActionSides,
  findBillTransition,
  findSettlementTransition,
  settlementActionSides,
  type BillAction,
  type BillSide,
  type BillStatus,
} from './transitions'

// design.md「状態遷移」の表（AC ではない。表そのものの確認）
// [操作, 側, 今の状態, 精算に入っているか, 次の状態, 経過の種類]
const EXPECTED: [BillAction, BillSide, BillStatus, boolean, BillStatus, string][] = [
  ['edit', 'from', 'requested', false, 'requested', 'edited'],
  ['edit', 'from', 'returned', false, 'requested', 'resubmitted'],
  ['cancel', 'from', 'requested', false, 'canceled', 'canceled'],
  ['cancel', 'from', 'returned', false, 'canceled', 'canceled'],
  ['pay', 'to', 'requested', false, 'paid', 'paid'],
  ['return', 'to', 'requested', false, 'returned', 'returned'],
  ['confirm', 'from', 'paid', false, 'confirmed', 'confirmed'],
  ['revert', 'to', 'paid', false, 'requested', 'payment_canceled'],
  ['revert', 'from', 'paid', false, 'requested', 'not_received'],
]

describe('請求の状態遷移の表', () => {
  it.each(EXPECTED)(
    '%s（%s 側、%s、精算 %s）→ %s・経過 %s',
    (action, side, status, settled, to, event) => {
      expect(findBillTransition(action, side, status, settled)).toEqual({ to, event })
    },
  )

  it('表に無い組み合わせ（状態 × 操作 × 側 × 精算）はすべて行えない', () => {
    for (const action of BILL_ACTIONS)
      for (const side of ['from', 'to'] as const)
        for (const status of BILL_STATUSES)
          for (const settled of [false, true]) {
            const listed = EXPECTED.some(
              ([a, s, st, se]) => a === action && s === side && st === status && se === settled,
            )
            if (!listed) expect(findBillTransition(action, side, status, settled)).toBeUndefined()
          }
  })

  it('操作に要る側', () => {
    expect(billActionSides('edit')).toEqual(['from'])
    expect(billActionSides('cancel')).toEqual(['from'])
    expect(billActionSides('confirm')).toEqual(['from'])
    expect(billActionSides('pay')).toEqual(['to'])
    expect(billActionSides('return')).toEqual(['to'])
    expect([...billActionSides('revert')].sort()).toEqual(['from', 'to'])
  })

  it('出すボタン：状態と側に合う操作だけ', () => {
    expect(availableBillActions('requested', false, ['from'])).toEqual(['edit', 'cancel'])
    expect(availableBillActions('requested', false, ['to'])).toEqual(['pay', 'return'])
    expect(availableBillActions('returned', false, ['from'])).toEqual(['edit', 'cancel'])
    expect(availableBillActions('returned', false, ['to'])).toEqual([])
    expect(availableBillActions('paid', false, ['from'])).toEqual(['confirm', 'revert'])
    expect(availableBillActions('paid', false, ['to'])).toEqual(['revert'])
    expect(availableBillActions('paid', true, ['from'])).toEqual([])
    expect(availableBillActions('confirmed', false, ['from', 'to'])).toEqual([])
    expect(availableBillActions('canceled', false, ['from'])).toEqual([])
    expect(availableBillActions('requested', false, [])).toEqual([])
  })
})

describe('精算の状態遷移の表', () => {
  it('まとめて受け取った：受け取る側が、支払済の精算に', () => {
    expect(findSettlementTransition('confirm', 'receiver', 'paid')).toEqual({
      to: 'confirmed',
      event: 'settled_confirmed',
    })
    expect(findSettlementTransition('confirm', 'payer', 'paid')).toBeUndefined()
    expect(findSettlementTransition('confirm', 'receiver', 'confirmed')).toBeUndefined()
    expect(findSettlementTransition('confirm', 'receiver', 'reverted')).toBeUndefined()
  })

  it('精算ごと戻す：払う側は「払ったを取り消した」、受け取る側は「受け取っていない」', () => {
    expect(findSettlementTransition('revert', 'payer', 'paid')).toEqual({
      to: 'reverted',
      event: 'settlement_payment_canceled',
    })
    expect(findSettlementTransition('revert', 'receiver', 'paid')).toEqual({
      to: 'reverted',
      event: 'settlement_not_received',
    })
    expect(findSettlementTransition('revert', 'payer', 'confirmed')).toBeUndefined()
    expect(findSettlementTransition('revert', 'receiver', 'reverted')).toBeUndefined()
  })

  it('操作に要る側', () => {
    expect(settlementActionSides('confirm')).toEqual(['receiver'])
    expect([...settlementActionSides('revert')].sort()).toEqual(['payer', 'receiver'])
  })

  it('出すボタン', () => {
    expect(availableSettlementActions('paid', ['receiver'])).toEqual(['confirm', 'revert'])
    expect(availableSettlementActions('paid', ['payer'])).toEqual(['revert'])
    expect(availableSettlementActions('confirmed', ['receiver'])).toEqual([])
    expect(availableSettlementActions('reverted', ['payer'])).toEqual([])
  })
})
