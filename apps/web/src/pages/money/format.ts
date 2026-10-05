import type { BillEvent, BillStatus, Party } from '@stylus/shared'

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
  settlement_payment_canceled: '払ったを取り消した（精算ごと）',
  settlement_not_received: '受け取っていない（精算ごと）',
}

// 精算額：「母がせいごに 2,500円」
export function settlementLabel(payer: Party, receiver: Party, amount: number): string {
  return `${payer.name}が${receiver.name}に ${yen(amount)}`
}
