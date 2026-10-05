// 精算額の計算（design.md「合計と精算額」、MONEY-F-010）
// 名義の側（self）と相手（counterpart）の間の請求中の請求を、両方向とも差し引く

export type SettlementBillInput = {
  amount: number
  // 名義の側が請求した（相手が払う）なら true
  requestedBySelf: boolean
}

export type SettlementResult = {
  // 名義の側が請求した額の小計（相手→self に払われる分）
  selfRequestedTotal: number
  // 相手が請求した額の小計
  counterpartRequestedTotal: number
  // 差し引いた精算額（0 以上）
  amount: number
  // 払う側。差し引き 0円 なら決まらない（まとめて払ったを押した側が払う側になる）
  payer: 'self' | 'counterpart' | null
}

export function computeSettlement(bills: readonly SettlementBillInput[]): SettlementResult {
  let selfRequestedTotal = 0
  let counterpartRequestedTotal = 0
  for (const b of bills) {
    if (b.requestedBySelf) selfRequestedTotal += b.amount
    else counterpartRequestedTotal += b.amount
  }
  const net = selfRequestedTotal - counterpartRequestedTotal
  return {
    selfRequestedTotal,
    counterpartRequestedTotal,
    amount: Math.abs(net),
    payer: net > 0 ? 'counterpart' : net < 0 ? 'self' : null,
  }
}
