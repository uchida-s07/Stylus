// 予約の状態（spec 003「この領域で使うことば」）。保存せず、開始・終了と今の時刻から求める
// - not_started：まだ始まっていない（今 < 開始）
// - in_use：使用中（開始 ≤ 今 < 終了）
// - ended：終わった（終了 ≤ 今）
// 「これからの予約」は not_started と in_use。判定は API が行い、画面はボタンの出し分けと「使用中」の印にだけ使う
export type ReservationPhase = 'not_started' | 'in_use' | 'ended'

type Instant = Date | string

export function reservationPhase(startsAt: Instant, endsAt: Instant, now: Date): ReservationPhase {
  const t = now.getTime()
  if (t < new Date(startsAt).getTime()) return 'not_started'
  if (t < new Date(endsAt).getTime()) return 'in_use'
  return 'ended'
}
