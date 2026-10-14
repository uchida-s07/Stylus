// 車の色（CAR-F-005）。GET /cars の colorIndex（登録の古い順に 0 から）番目の色。9台目からは繰り返す
// 帯の文字は白なので、白の文字が読める濃さの色にする
export const CAR_COLORS: readonly string[] = [
  '#1c7ed6', // 青
  '#2b8a3e', // 緑
  '#d9480f', // 橙
  '#9c36b5', // 紫
  '#0b7285', // 青緑
  '#c92a2a', // 赤
  '#5f3dc4', // すみれ
  '#795548', // 茶
]

export function carColor(colorIndex: number): string {
  return CAR_COLORS[colorIndex % CAR_COLORS.length]!
}
