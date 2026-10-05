import type { BillEvent, BillStatus, Party, SettlementStatus } from '@stylus/shared'

// お金の画面の表示の形

// 金額：3,000円
export function yen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`
}

// 発生日：2026/10/04
export function dateLabel(date: string): string {
  return date.replaceAll('-', '/')
}

// 日時（日本時間）：2026/10/04 12:00
export function dateTimeLabel(iso: string): string {
  const jst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString()
  return `${jst.slice(0, 10).replaceAll('-', '/')} ${jst.slice(11, 16)}`
}

export const STATUS_LABELS: Record<BillStatus, string> = {
  requested: '請求中',
  returned: '差し戻し',
  paid: '支払済',
  confirmed: '確認済',
  canceled: '取消',
}

// 状態のタグの色：次にすることで分ける（2026-10-05 オーナー決定）
// 払うのを待つ＝青、直す必要がある＝オレンジ、受け取りの確認を待つ＝黄、片付いた＝緑、取り消した・戻した＝灰
export const STATUS_COLORS: Record<BillStatus, string> = {
  requested: 'blue',
  returned: 'orange',
  paid: 'yellow',
  confirmed: 'green',
  canceled: 'gray',
}

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  paid: '受け取り待ち',
  confirmed: '受け取り済み',
  reverted: '戻した',
}

export const SETTLEMENT_STATUS_COLORS: Record<SettlementStatus, string> = {
  paid: 'yellow',
  confirmed: 'green',
  reverted: 'gray',
}

// 請求の向き：せいご → 母
export function direction(from: Party, to: Party): string {
  return `${from.name} → ${to.name}`
}

export const EVENT_LABELS: Record<BillEvent['kind'], string> = {
  created: '登録',
  edited: '直した',
  resubmitted: '出し直した',
  canceled: '取り消した',
  paid: '払った',
  returned: '差し戻した',
  confirmed: '受け取った',
  payment_canceled: '払ったを取り消した',
  not_received: '受け取っていない',
  settled_paid: '精算でまとめて払った',
  settled_confirmed: '精算でまとめて受け取った',
  // 精算ごと戻したものは、経過の下に精算の相手と精算額を出す
  settlement_payment_canceled: '払ったを取り消した',
  settlement_not_received: '受け取っていない',
}

// 精算額：「母がせいごに 2,500円」
export function settlementLabel(payer: Party, receiver: Party, amount: number): string {
  return `${payer.name}が${receiver.name}に ${yen(amount)}`
}

// 開いた後に変わっていたとき（spec 002「この領域で共通の振る舞い」）
export const BILL_CHANGED = {
  state: '請求の状態が変わりました。もう一度開いてください。',
  content: '請求の中身が変わりました。もう一度確かめてください。',
} as const

export const SETTLEMENT_CHANGED = '精算の中身が変わりました。もう一度確かめてください。'
