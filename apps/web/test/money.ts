import type {
  ApiErrorCode,
  BillDetail,
  BillListResponse,
  BillSummary,
  MemberListResponse,
  Party,
} from '@stylus/shared'
import type { MeResponse } from '@stylus/shared'
import { json } from './fakeApi'
import { fakeSupabase, testSession } from './fakeSupabase'

// お金の画面のテスト用の家族とデータ（API の応答の形で作る）
export const FAMILY = {
  father: { id: '10000000-0000-4000-8000-000000000001', displayName: '父', isParent: true },
  mother: { id: '10000000-0000-4000-8000-000000000002', displayName: '母', isParent: true },
  seigo: { id: '10000000-0000-4000-8000-000000000003', displayName: 'せいご', isParent: false },
  kugo: { id: '10000000-0000-4000-8000-000000000004', displayName: 'くうご', isParent: false },
} as const

export type FamilyKey = keyof typeof FAMILY

export const MEMBERS: MemberListResponse = { members: Object.values(FAMILY) }

export const CATEGORIES = {
  categories: [
    { id: '20000000-0000-4000-8000-000000000001', name: '医療費' },
    { id: '20000000-0000-4000-8000-000000000002', name: '食費' },
    { id: '20000000-0000-4000-8000-000000000003', name: '交通費' },
    { id: '20000000-0000-4000-8000-000000000004', name: '日用品' },
    { id: '20000000-0000-4000-8000-000000000005', name: 'その他' },
  ],
}

// 当事者（null は「家庭」）
export function party(who: FamilyKey | null): Party {
  return who === null
    ? { memberId: null, name: '家庭' }
    : { memberId: FAMILY[who].id, name: FAMILY[who].displayName }
}

let seq = 0
export function billSummary(
  overrides: Partial<BillSummary> & { fromKey?: FamilyKey | null; toKey?: FamilyKey | null } = {},
): BillSummary {
  const { fromKey = 'seigo', toKey = 'mother', ...rest } = overrides
  seq += 1
  return {
    id: `30000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    from: party(fromKey),
    to: party(toKey),
    amount: 3000,
    category: CATEGORIES.categories[0]!,
    title: '歯医者',
    occurredOn: '2026-10-04',
    status: 'requested',
    version: 1,
    settlementId: null,
    createdAt: '2026-10-04T03:00:00.000Z',
    ...rest,
  }
}

export function billDetail(
  overrides: Partial<BillDetail> & { fromKey?: FamilyKey | null; toKey?: FamilyKey | null } = {},
): BillDetail {
  const { memo = null, events = [], sides = ['from'], ...rest } = overrides
  return { ...billSummary(rest), memo, events, sides }
}

export function listResponse(overrides: Partial<BillListResponse> = {}): BillListResponse {
  return {
    bills: [],
    totals: { self: { pay: 0, receive: 0 }, household: null },
    pendingSettlements: [],
    ...overrides,
  }
}

export function errorResponse(status: number, code: ApiErrorCode, message = 'x', fields?: object) {
  return () => json({ error: { code, message, ...(fields && { fields }) } }, status)
}

// ログイン済みにする
export function signIn() {
  fakeSupabase.setStoredSession(testSession())
}

// 自分の情報（GET /me の応答）
export function meOf(who: FamilyKey): MeResponse {
  const m = FAMILY[who]
  return { ...m, isAdmin: who === 'seigo', isCook: who === 'mother' }
}

// 応答を待たせる（送っている間の画面を確かめるため）。release で応答を返す
export function deferred(response: () => Response) {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  return {
    handler: async () => {
      await gate
      return response()
    },
    release: () => release(),
  }
}
