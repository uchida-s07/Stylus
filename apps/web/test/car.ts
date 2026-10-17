import type {
  ApiErrorCode,
  CarListItem,
  CarListResponse,
  Reservation,
  ReservationDetail,
  ReservationListResponse,
} from '@stylus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, vi } from 'vitest'
import { HOUR_HEIGHT } from '../src/pages/car/timeFrame'
import { installFakeApi, json, meRoute } from './fakeApi'
import { FAMILY, meOf, type FamilyKey } from './money'

// 車の画面のテスト用のデータ（API の応答の形で作る）。家族は money.ts と同じ

export const CAR_IDS = {
  BMW: '40000000-0000-4000-8000-000000000001',
  ノア: '40000000-0000-4000-8000-000000000002',
  フィット: '40000000-0000-4000-8000-000000000003',
} as const

export type CarName = keyof typeof CAR_IDS

export function carItem(name: CarName, overrides: Partial<CarListItem> = {}): CarListItem {
  return {
    id: CAR_IDS[name],
    name,
    isActive: true,
    hasReservations: false,
    upcomingCount: 0,
    colorIndex: 0,
    ...overrides,
  }
}

export function carList(...cars: CarListItem[]): CarListResponse {
  return { cars }
}

// 日本時間の「YYYY-MM-DD HH:MM」を API の日時（ISO 8601）にする
export function jstIso(dateTime: string): string {
  return new Date(`${dateTime.replace(' ', 'T')}:00+09:00`).toISOString()
}

let seq = 0
export function reservation(
  values: {
    car?: CarName
    carActive?: boolean
    who?: FamilyKey
    from: string
    to: string
  } & Partial<Pick<Reservation, 'destination' | 'version' | 'id'>>,
): Reservation {
  const { car = 'ノア', carActive = true, who = 'kugo', from, to, ...rest } = values
  seq += 1
  return {
    id: `50000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    car: { id: CAR_IDS[car], name: car, isActive: carActive },
    member: { id: FAMILY[who].id, displayName: FAMILY[who].displayName },
    startsAt: jstIso(from),
    endsAt: jstIso(to),
    destination: null,
    version: 1,
    ...rest,
  }
}

export function reservationDetail(
  values: Parameters<typeof reservation>[0] & { memo?: string | null; isMine?: boolean },
): ReservationDetail {
  const { memo = null, isMine = false, ...rest } = values
  return { ...reservation(rest), memo, isMine }
}

export function reservationList(
  reservations: Reservation[],
  nextCursor: string | null = null,
): ReservationListResponse {
  return { reservations, nextCursor }
}

export function carError(status: number, code: ApiErrorCode, message = 'x', extra: object = {}) {
  return () => json({ error: { code, message, ...extra } }, status)
}

// 車の画面の偽物の API。自分の情報は既定でくうご
export function installCarApi(
  routes: Parameters<typeof installFakeApi>[0],
  me: FamilyKey = 'kugo',
) {
  return installFakeApi({ 'GET /me': meRoute(meOf(me)), ...routes })
}

// 端末の時計を日本時間の「YYYY-MM-DD HH:MM」にする（Date だけを差し替え、タイマーは本物のまま）
export function setDeviceClock(dateTime: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(jstIso(dateTime)))
}

// ---- 車の画面のカレンダー（spec 004） ----

// 車の画面は遅延読み込みで、最初に開くときはカレンダーの部品の読み込みに時間がかかるので、待つ時間を長くとる
const CALENDAR_WAIT = { timeout: 4000 }

// 月のカレンダーの画面の月のカレンダー（「2026年10月」など。時間割は出ていない）
export async function monthCalendar(month: string) {
  const calendar = await screen.findByRole(
    'region',
    { name: `${month}のカレンダー` },
    CALENDAR_WAIT,
  )
  expect(screen.queryByRole('region', { name: /の時間割$/ })).not.toBeInTheDocument()
  return calendar
}

// 月のカレンダーの日のセル（名前は日付の見出し「10月7日(水)」のボタン）
function dayCells(calendar: HTMLElement): HTMLElement[] {
  return within(calendar)
    .getAllByRole('button')
    .filter((b) => /^\d+月\d+日\(.\)$/.test(b.getAttribute('aria-label') ?? ''))
}

// 月のカレンダーのその日の短い帯と「他 n 件」（無ければ null）
export async function monthDay(
  month: string,
  dayLabel: string,
): Promise<{ bands: HTMLElement[]; more: string | null }> {
  const calendar = await monthCalendar(month)
  const cell = within(calendar).getByRole('button', { name: dayLabel })
  return {
    bands: Array.from(cell.querySelectorAll<HTMLElement>('[data-reservation-id]')),
    more: cell.querySelector('[data-more]')?.textContent ?? null,
  }
}

// 月のカレンダーで帯の出ている日を、日付の見出しで並べる（42日のセルが揃っていることも確かめる）
export async function daysWithBands(month: string): Promise<string[]> {
  const calendar = await monthCalendar(month)
  const cells = dayCells(calendar)
  expect(cells).toHaveLength(42)
  return cells
    .filter((c) => c.querySelector('[data-reservation-id]') !== null)
    .map((c) => c.getAttribute('aria-label')!)
}

// 月のカレンダーで日を押し、その日の時間割の画面へ移るのを待つ
export async function selectDay(dayLabel: string) {
  const calendar = await screen.findByRole('region', { name: /のカレンダー$/ }, CALENDAR_WAIT)
  await userEvent.click(within(calendar).getByRole('button', { name: dayLabel }))
  await dayView(dayLabel)
}

// 日の時間割の画面（見出しがその日で、「月へ戻る」があり、月のカレンダーは出ていない）。時間割を返す
export async function dayView(dayLabel: string): Promise<HTMLElement> {
  const timeGrid = await screen.findByRole('region', { name: `${dayLabel}の時間割` }, CALENDAR_WAIT)
  expect(screen.getByRole('heading', { name: dayLabel })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '月へ戻る' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: /のカレンダー$/ })).not.toBeInTheDocument()
  return timeGrid
}

// 日の時間割の画面の帯（その日の時間割の画面であることも確かめる）
export async function bandsOn(dayLabel: string): Promise<HTMLElement[]> {
  const timeGrid = await dayView(dayLabel)
  return Array.from(timeGrid.querySelectorAll<HTMLElement>('[data-reservation-id]'))
}

// 日付と時刻の欄に入れる（日付は YYYY-MM-DD、時刻は HH:MM）
export async function fillDateTime(which: '開始' | '終了', date: string, time: string) {
  const dateInput = screen.getByLabelText(`${which}の日付`)
  const timeInput = screen.getByLabelText(`${which}の時刻`)
  await userEvent.clear(dateInput)
  if (date) await userEvent.type(dateInput, date)
  await userEvent.clear(timeInput)
  if (time) await userEvent.type(timeInput, time)
}

// ---- 時間割の枠（pointer のイベントで操作する） ----
// jsdom では寸法がすべて0なので、時間割の面の上の端は 0。時刻の位置は「分 ÷ 60 × 1時間の高さ」になる

const minutesOf = (time: string) => {
  const [h, m] = time.split(':').map(Number) as [number, number]
  return h * 60 + m
}

// 時刻（「9:07」「24:00」など）の、時間割の面の上の端からの距離
export const yOf = (time: string) => (minutesOf(time) / 60) * HOUR_HEIGHT

// 時間割の帯と枠の面
function timeGridLane(): HTMLElement {
  const lane = document.querySelector<HTMLElement>('[data-time-grid-lane]')
  if (!lane) throw new Error('時間割が出ていない')
  return lane
}

function frameElement(): HTMLElement {
  const frame = document.querySelector<HTMLElement>('[data-frame]')
  if (!frame) throw new Error('枠が出ていない')
  return frame
}

const pointerInit = (y: number, x = 20) => ({
  clientX: x,
  clientY: y,
  pointerId: 1,
  pointerType: 'touch',
  isPrimary: true,
  button: 0,
})

// target で押して、moves の位置を順に通って、最後の位置で離す（x は横の位置）
function press(
  target: HTMLElement,
  from: { x?: number; y: number },
  ...moves: { x?: number; y: number }[]
) {
  fireEvent.pointerDown(target, pointerInit(from.y, from.x))
  for (const m of moves) fireEvent.pointerMove(target, pointerInit(m.y, m.x))
  const last = moves.at(-1) ?? from
  fireEvent.pointerUp(target, pointerInit(last.y, last.x))
}

// 時間割の空いた所（帯の脇の余白を含む）をその時刻の位置でタップする
export async function tapTimeGrid(time: string) {
  await waitFor(() => timeGridLane(), CALENDAR_WAIT)
  press(timeGridLane(), { y: yOf(time) })
}

// 出ている枠（「09:00〜10:00」の形。終了 24:00 は「24:00」）。無ければ null
export function timeFrame(): string | null {
  const frame = document.querySelector<HTMLElement>('[data-frame]')
  return frame ? `${frame.dataset.frameStart}〜${frame.dataset.frameEnd}` : null
}

// 枠の上の端（start）・下の端（end）のつまみを、その時刻の位置まで引く
export function dragFrameEdge(edge: 'start' | 'end', time: string) {
  const frame = frameElement()
  const handle = frame.querySelector<HTMLElement>(`[data-frame-handle="${edge}"]`)!
  const now = edge === 'start' ? frame.dataset.frameStart! : frame.dataset.frameEnd!
  press(handle, { y: yOf(now) }, { y: (yOf(now) + yOf(time)) / 2 }, { y: yOf(time) })
}

// 枠の中を引いて、その分だけ縦に動かす（下が正）
export function dragFrameBy(minutes: number) {
  const frame = frameElement()
  const y = yOf(frame.dataset.frameStart!) + 4
  const dy = (minutes / 60) * HOUR_HEIGHT
  press(frame, { y }, { y: y + dy / 2 }, { y: y + dy })
}

// 枠をタップする（引かずに離す）
export function tapFrame() {
  const frame = frameElement()
  press(frame, { y: yOf(frame.dataset.frameStart!) + 4 })
}

// 時間割を、その時刻の高さで左右にスワイプする（dx は横に動かす量。左は負）
// on: 'grid' は空いた所で、'frame' は枠の上で始める
export async function swipeTimeGrid(
  direction: 'left' | 'right',
  options: { at?: string; dx?: number; dy?: number; on?: 'grid' | 'frame' } = {},
) {
  const { at = '09:30', dx = 120, dy = 0, on = 'grid' } = options
  await waitFor(() => timeGridLane(), CALENDAR_WAIT)
  const target = on === 'frame' ? frameElement() : timeGridLane()
  const y = on === 'frame' ? yOf(frameElement().dataset.frameStart!) + 4 : yOf(at)
  const sign = direction === 'left' ? -1 : 1
  const x = 180
  press(
    target,
    { x, y },
    { x: x + (sign * dx) / 2, y: y + dy / 2 },
    { x: x + sign * dx, y: y + dy },
  )
}

// 時刻 from をタップして枠を出し、下の端を to まで引く（from〜to の枠）
export async function makeFrame(from: string, to: string) {
  await tapTimeGrid(from)
  // 出た枠の終わりがもう to なら引かない（同じ所へ引くと、動かずに離したタップになる）
  if (timeFrame()?.endsWith(to.padStart(5, '0')) !== true) dragFrameEdge('end', to)
  expect(timeFrame()).toBe(`${from.padStart(5, '0')}〜${to.padStart(5, '0')}`)
}
