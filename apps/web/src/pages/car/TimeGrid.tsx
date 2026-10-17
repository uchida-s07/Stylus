import {
  formatJstDate,
  jstStartOfDay,
  reservationPhase,
  toJstDate,
  type CarListItem,
  type Reservation,
} from '@stylus/shared'
import { Badge, Text } from '@mantine/core'
import { useLayoutEffect, useRef, type CSSProperties, type PointerEvent } from 'react'
import { Link } from 'react-router'
import { layoutBands } from './bandLayout'
import { carColor } from './carColors'
import { timeRange } from './format'
import { HOUR_HEIGHT, minuteAt, moveFrame, offsetOf, resizeFrame, type Frame } from './timeFrame'
import './car-calendar.css'

// 日の画面の時間割（CAR-F-004・CAR-F-005）。Mantine と React で自作する（spec 004 F-3）
// 0:00〜24:00 を縦に並べ、1時間ごとの目盛りと30分の補助の線。予約は開始から終了までの位置と長さの帯で出す
// 時間が重なる帯は幅を分けて横に並べ、帯の右にはいつも帯の無い余白を残す（そこをタップして枠を出せる）
// 時刻はその日の 0:00 からの分で扱い、日付はすべて日本時間（@stylus/shared の日付の部品。COMMON-N-009）

const DAY_MINUTES = 1440
const HOURS = Array.from({ length: 24 }, (_, h) => h)
// 時間割の見えている高さ（その中を縦にスクロールする）
const VIEW_HEIGHT = 480
// これより動かずに離したらタップ（px）
const TAP_SLOP = 8
// 空いた所で、横にこれより動き、横の動きが縦より大きければスワイプ（px）
const SWIPE_MIN = 50

// 押してから離すまでの操作。kind は、空いた所・枠ごと動かす・上の端・下の端
type Drag = {
  kind: 'empty' | 'move' | 'start' | 'end'
  pointerId: number
  x: number
  y: number
  // 押したときの枠（動かした量はここからの差で求める）
  initial: Frame | null
  moved: boolean
}

export function TimeGrid({
  date,
  cars,
  reservations,
  frame,
  onTapEmpty,
  onFrameChange,
  onClearFrame,
  onOpenFrame,
  onSwipeDay,
}: {
  // その日（日本時間の YYYY-MM-DD）
  date: string
  // 車の一覧（帯の色の番号 colorIndex を引く）
  cars: CarListItem[]
  // その日にかかる予約
  reservations: Reservation[]
  // 出ている枠（無ければ null）
  frame: Frame | null
  // 枠が無いときに空いた所をタップした（その分）
  onTapEmpty: (minute: number) => void
  // 枠の端や中を引いた
  onFrameChange: (frame: Frame) => void
  // 枠が出ているときに枠の外の空いた所をタップした
  onClearFrame: () => void
  // 枠をタップした（引かずに離した）
  onOpenFrame: () => void
  // 空いた所で左右にスワイプした（左は次の日 1、右は前の日 -1）
  onSwipeDay: (delta: 1 | -1) => void
}) {
  const label = formatJstDate(jstStartOfDay(date)!)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dayStart = jstStartOfDay(date)!.getTime()
  // 予約をその日にかかる分（0〜1440 の分）に切る。その日にかからない予約は出さない
  const spans = reservations
    .map((r) => ({
      reservation: r,
      id: r.id,
      start: Math.max(0, (Date.parse(r.startsAt) - dayStart) / 60_000),
      end: Math.min(DAY_MINUTES, (Date.parse(r.endsAt) - dayStart) / 60_000),
    }))
    .filter((s) => s.start < s.end)
  const places = layoutBands(spans)
  // 一覧に無い車（読み込みの間に増えた車）は 0 番の色にする
  const colorIndexOf = (carId: string) => cars.find((c) => c.id === carId)?.colorIndex ?? 0
  const now = new Date()
  const nowMinute = date === toJstDate(now) ? (now.getTime() - dayStart) / 60_000 : null

  // 最初の表示位置：今日なら今の時刻の1時間前、それ以外の日は 8:00（日が変わると車の画面が作り直す）
  useLayoutEffect(() => {
    const first = nowMinute === null ? 8 * 60 : Math.max(Math.floor(nowMinute / 60) - 1, 0) * 60
    if (scrollRef.current) scrollRef.current.scrollTop = offsetOf(first)
    // 開いたときだけ合わせる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 時間割の面の上での指・マウスの操作（pointer のイベントでどちらも同じに扱う）
  // 押した所で何をするかを決める：枠の端のつまみ → 端を引く、枠の中 → 枠ごと動かす、空いた所 → タップか左右のスワイプ
  // 枠の上で始めた操作は、横に動いても枠を動かす操作として扱う（日は移らない）
  // 帯の上で押したときは何もしない（帯はリンクなので、押すと予約の中身へ進む）
  const drag = useRef<Drag | null>(null)
  // 時間割の面の上の端からの距離を分にする（jsdom では寸法が0なので、上の端は 0 になる）
  const minuteOfPointer = (e: PointerEvent<HTMLElement>) =>
    minuteAt(e.clientY - e.currentTarget.getBoundingClientRect().top)

  const pointerHandlers = {
    onPointerDown(e: PointerEvent<HTMLDivElement>) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const target = e.target as Element
      if (target.closest('[data-reservation-id]')) return
      const handle = target.closest<HTMLElement>('[data-frame-handle]')?.dataset.frameHandle as
        'start' | 'end' | undefined
      const onFrame = frame !== null && target.closest('[data-frame]') !== null
      drag.current = {
        kind: handle ?? (onFrame ? 'move' : 'empty'),
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        initial: frame,
        moved: false,
      }
      // 枠を引いている間は、指が面の外へ出ても動きを受け取る（jsdom には無い）
      if (handle || onFrame) e.currentTarget.setPointerCapture?.(e.pointerId)
    },
    onPointerMove(e: PointerEvent<HTMLDivElement>) {
      const d = drag.current
      if (!d || d.pointerId !== e.pointerId) return
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      if (!d.moved && Math.hypot(dx, dy) < TAP_SLOP) return
      d.moved = true
      if (!d.initial) return
      if (d.kind === 'move') onFrameChange(moveFrame(d.initial, (dy / HOUR_HEIGHT) * 60))
      else if (d.kind !== 'empty') onFrameChange(resizeFrame(d.initial, d.kind, minuteOfPointer(e)))
    },
    onPointerUp(e: PointerEvent<HTMLDivElement>) {
      const d = drag.current
      drag.current = null
      if (!d || d.pointerId !== e.pointerId) return
      if (d.moved) {
        const dx = e.clientX - d.x
        const dy = e.clientY - d.y
        if (d.kind === 'empty' && Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
          onSwipeDay(dx < 0 ? 1 : -1)
        }
        return
      }
      // 引かずに離した（タップ）
      if (d.kind !== 'empty') return onOpenFrame()
      if (frame) return onClearFrame()
      onTapEmpty(minuteOfPointer(e))
    },
    // スクロールが始まったときなど、ブラウザが操作を取り上げた
    onPointerCancel() {
      drag.current = null
    },
  }

  return (
    <section aria-label={`${label}の時間割`}>
      <div ref={scrollRef} className="car-grid-scroll" style={{ height: VIEW_HEIGHT }}>
        <div className="car-grid" style={{ height: offsetOf(DAY_MINUTES) }}>
          {HOURS.map((h) => (
            <div
              key={h}
              className="car-grid-hour"
              style={{ top: offsetOf(h * 60), height: HOUR_HEIGHT }}
              aria-hidden
            >
              {h}:00
            </div>
          ))}
          <div
            className="car-grid-lane"
            style={{ '--car-hour': `${HOUR_HEIGHT}px` } as CSSProperties}
            data-time-grid-lane
            {...pointerHandlers}
          >
            <div className="car-grid-bands">
              {spans.map((s) => {
                const place = places.get(s.id)!
                const colorIndex = colorIndexOf(s.reservation.car.id)
                return (
                  <ReservationBand
                    key={s.id}
                    reservation={s.reservation}
                    colorIndex={colorIndex}
                    style={{
                      top: offsetOf(s.start),
                      height: offsetOf(s.end - s.start),
                      left: `${(place.column / place.columns) * 100}%`,
                      width: `${100 / place.columns}%`,
                      background: carColor(colorIndex),
                    }}
                  />
                )
              })}
            </div>
            {nowMinute !== null && (
              <div className="car-grid-now" style={{ top: offsetOf(nowMinute) }} data-now-line />
            )}
            {frame && <TimeFrameBox frame={frame} />}
          </div>
        </div>
      </div>
    </section>
  )
}

// 枠：開始〜終了の時刻を出す。上下の端につまみ。データの属性に開始と終了（HH:MM、終了 24:00 は「24:00」）
function TimeFrameBox({ frame }: { frame: Frame }) {
  return (
    <div
      className="car-frame"
      style={{ top: offsetOf(frame.start), height: offsetOf(frame.end - frame.start) }}
      data-frame
      data-frame-start={hhmm(frame.start)}
      data-frame-end={hhmm(frame.end)}
    >
      <div className="car-frame-handle car-frame-handle-start" data-frame-handle="start" />
      <span className="car-frame-label">
        {clock(frame.start)}〜{clock(frame.end)}
      </span>
      <div className="car-frame-handle car-frame-handle-end" data-frame-handle="end" />
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
// 画面に出す時刻（「9:00」の形。24:00 は「24:00」）
const clock = (minute: number) => `${Math.floor(minute / 60)}:${pad(minute % 60)}`

// 帯：その予約の中身へのリンク。車の名前（「使わない」の車には「使わない」を添える）・表示名・時間・行き先。使用中なら「使用中」
// 「使用中」の印は端末の時計で決める（見た目だけ。判定は API が行う）
// 色の番号と「使わない」の印はデータの属性にも付ける（「使わない」は薄くする）
function ReservationBand({
  reservation: r,
  colorIndex,
  style,
}: {
  reservation: Reservation
  colorIndex: number
  style: CSSProperties
}) {
  const inUse = reservationPhase(r.startsAt, r.endsAt, new Date()) === 'in_use'
  return (
    <Link
      to={`/car/reservations/${r.id}`}
      className={r.car.isActive ? 'car-band' : 'car-band car-band-inactive'}
      style={style}
      data-reservation-id={r.id}
      data-color-index={colorIndex}
      data-inactive={!r.car.isActive}
    >
      <Text size="xs" fw={700} lh={1.3} truncate>
        {r.car.name}
        {!r.car.isActive && '（使わない）'} {r.member.displayName}
      </Text>
      <Text size="xs" lh={1.3}>
        {timeRange(r.startsAt, r.endsAt)}
      </Text>
      {r.destination && (
        <Text size="xs" lh={1.3} truncate>
          {r.destination}
        </Text>
      )}
      {inUse && (
        <Badge size="xs" variant="filled" color="orange">
          使用中
        </Badge>
      )}
    </Link>
  )
}
