// 請求・精算の状態遷移の表（design.md「状態遷移」）
// API は操作の前にこの表で可否を判定し、画面はボタンの出し分け（見た目だけ）に使う。表はここに1つだけ置く

export const BILL_STATUSES = ['requested', 'returned', 'paid', 'confirmed', 'canceled'] as const
export type BillStatus = (typeof BILL_STATUSES)[number]

export const BILL_EVENT_KINDS = [
  'created',
  'edited',
  'resubmitted',
  'canceled',
  'paid',
  'returned',
  'confirmed',
  'payment_canceled',
  'not_received',
  'settled_paid',
  'settled_confirmed',
  'settlement_payment_canceled',
  'settlement_not_received',
] as const
export type BillEventKind = (typeof BILL_EVENT_KINDS)[number]

export const SETTLEMENT_STATUSES = ['paid', 'confirmed', 'reverted'] as const
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number]

// 1件ずつの操作。edit は「直す」と「出し直す」の両方（今の状態で経過の種類が変わる）
// revert は支払済を請求中へ戻す（請求先側なら「払ったを取り消す」、請求する側なら「受け取っていない」）
export const BILL_ACTIONS = ['edit', 'cancel', 'pay', 'return', 'confirm', 'revert'] as const
export type BillAction = (typeof BILL_ACTIONS)[number]

// 請求する側（from）・請求先側（to）
export type BillSide = 'from' | 'to'

type BillTransition = {
  action: BillAction
  side: BillSide
  status: BillStatus
  to: BillStatus
  event: BillEventKind
}

// 1件ずつの操作は、どれも精算に入っていない請求だけに行える
const BILL_TRANSITIONS: readonly BillTransition[] = [
  { action: 'edit', side: 'from', status: 'requested', to: 'requested', event: 'edited' },
  { action: 'edit', side: 'from', status: 'returned', to: 'requested', event: 'resubmitted' },
  { action: 'cancel', side: 'from', status: 'requested', to: 'canceled', event: 'canceled' },
  { action: 'cancel', side: 'from', status: 'returned', to: 'canceled', event: 'canceled' },
  { action: 'pay', side: 'to', status: 'requested', to: 'paid', event: 'paid' },
  { action: 'return', side: 'to', status: 'requested', to: 'returned', event: 'returned' },
  { action: 'confirm', side: 'from', status: 'paid', to: 'confirmed', event: 'confirmed' },
  { action: 'revert', side: 'to', status: 'paid', to: 'requested', event: 'payment_canceled' },
  { action: 'revert', side: 'from', status: 'paid', to: 'requested', event: 'not_received' },
]

// 今の状態でその側がその操作を行えるなら、次の状態と経過の種類を返す
export function findBillTransition(
  action: BillAction,
  side: BillSide,
  status: BillStatus,
  inSettlement: boolean,
): { to: BillStatus; event: BillEventKind } | undefined {
  if (inSettlement) return undefined
  const t = BILL_TRANSITIONS.find(
    (t) => t.action === action && t.side === side && t.status === status,
  )
  return t && { to: t.to, event: t.event }
}

// 操作に要る側（どれでもなければ 403）
export function billActionSides(action: BillAction): readonly BillSide[] {
  return [...new Set(BILL_TRANSITIONS.filter((t) => t.action === action).map((t) => t.side))]
}

// 今の状態と自分の側で行える操作（BILL_ACTIONS の順）
export function availableBillActions(
  status: BillStatus,
  inSettlement: boolean,
  sides: readonly BillSide[],
): BillAction[] {
  return BILL_ACTIONS.filter((action) =>
    sides.some((side) => findBillTransition(action, side, status, inSettlement)),
  )
}

// 精算の操作（まとめて払ったは精算を作る操作なので、ここには無い）
export const SETTLEMENT_ACTIONS = ['confirm', 'revert'] as const
export type SettlementAction = (typeof SETTLEMENT_ACTIONS)[number]

// 精算の払う側・受け取る側
export type SettlementSide = 'payer' | 'receiver'

type SettlementTransition = {
  action: SettlementAction
  side: SettlementSide
  status: SettlementStatus
  to: SettlementStatus
  event: BillEventKind
}

// 含まれる請求は、confirm で確認済に、revert で請求中に戻る（精算から外れる）
const SETTLEMENT_TRANSITIONS: readonly SettlementTransition[] = [
  {
    action: 'confirm',
    side: 'receiver',
    status: 'paid',
    to: 'confirmed',
    event: 'settled_confirmed',
  },
  {
    action: 'revert',
    side: 'payer',
    status: 'paid',
    to: 'reverted',
    event: 'settlement_payment_canceled',
  },
  {
    action: 'revert',
    side: 'receiver',
    status: 'paid',
    to: 'reverted',
    event: 'settlement_not_received',
  },
]

export function findSettlementTransition(
  action: SettlementAction,
  side: SettlementSide,
  status: SettlementStatus,
): { to: SettlementStatus; event: BillEventKind } | undefined {
  const t = SETTLEMENT_TRANSITIONS.find(
    (t) => t.action === action && t.side === side && t.status === status,
  )
  return t && { to: t.to, event: t.event }
}

export function settlementActionSides(action: SettlementAction): readonly SettlementSide[] {
  return [...new Set(SETTLEMENT_TRANSITIONS.filter((t) => t.action === action).map((t) => t.side))]
}

export function availableSettlementActions(
  status: SettlementStatus,
  sides: readonly SettlementSide[],
): SettlementAction[] {
  return SETTLEMENT_ACTIONS.filter((action) =>
    sides.some((side) => findSettlementTransition(action, side, status)),
  )
}
