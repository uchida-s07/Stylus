import type {
  ApiErrorCode,
  CarListItem,
  CarListResponse,
  Reservation,
  ReservationDetail,
  ReservationListResponse,
} from '@stylus/shared'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, vi } from 'vitest'
import { timeGridRef } from '../src/pages/car/timeGridRef'
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
  // FullCalendar が時間割（日の列）を描き終えてから帯を数える
  await waitFor(() => expect(timeGrid.querySelector('[data-date]')).not.toBeNull())
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

// 時間割で範囲を選ぶ（日本時間の「YYYY-MM-DD HH:MM」。jsdom ではドラッグできないので FullCalendar の select を呼ぶ）
export async function selectRange(from: string, to: string) {
  await waitFor(() => expect(timeGridRef.current).not.toBeNull(), CALENDAR_WAIT)
  act(() => timeGridRef.current!.getApi().select(jstIso(from), jstIso(to)))
}
