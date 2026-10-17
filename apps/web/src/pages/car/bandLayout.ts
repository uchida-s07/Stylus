// 時間割の帯の横の並べ方（CAR-F-005）：時間が重なる帯どうしで幅を分けて横に並べる
// 時刻はその日の 0:00 からの分。重なりでつながる帯の塊ごとに列を数え、帯は空いている一番左の列に入る

export type BandSpan = { id: string; start: number; end: number }
export type BandPlace = { column: number; columns: number }

export function layoutBands(spans: BandSpan[]): Map<string, BandPlace> {
  const places = new Map<string, BandPlace>()
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end)
  // 今の塊：列ごとの最後の帯の終わりと、塊に入った帯
  let columnEnds: number[] = []
  let members: { id: string; column: number }[] = []
  let clusterEnd = -Infinity
  const closeCluster = () => {
    for (const m of members) places.set(m.id, { column: m.column, columns: columnEnds.length })
    columnEnds = []
    members = []
  }
  for (const s of sorted) {
    if (s.start >= clusterEnd) closeCluster()
    let column = columnEnds.findIndex((end) => end <= s.start)
    if (column === -1) column = columnEnds.push(s.end) - 1
    else columnEnds[column] = s.end
    members.push({ id: s.id, column })
    clusterEnd = Math.max(clusterEnd, s.end)
  }
  closeCluster()
  return places
}
