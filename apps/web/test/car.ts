import type {
  ApiErrorCode,
  CarListItem,
  CarListResponse,
  Reservation,
  ReservationDetail,
  ReservationListResponse,
} from '@stylus/shared'
import { vi } from 'vitest'
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
