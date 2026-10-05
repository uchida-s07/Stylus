import { members } from '../src/db/schema'
import type { Member } from '../src/env'
import type { TestDb } from './db'
import { signTestToken } from './jwt'

// 家族のテスト用データ（父・母・せいご・くうご）。お金のテストはここから使う
// せいごは管理者、父・母は親、母は料理担当
export const FAMILY = {
  father: {
    authUserId: '1a2b3c4d-0000-4000-8000-000000000001',
    email: 'father@example.com',
    displayName: '父',
    isParent: true,
  },
  mother: {
    authUserId: '1a2b3c4d-0000-4000-8000-000000000002',
    email: 'mother@example.com',
    displayName: '母',
    isParent: true,
    isCook: true,
  },
  seigo: {
    authUserId: '1a2b3c4d-0000-4000-8000-000000000003',
    email: 'seigo@example.com',
    displayName: 'せいご',
    isAdmin: true,
  },
  kugo: {
    authUserId: '1a2b3c4d-0000-4000-8000-000000000004',
    email: 'kugo@example.com',
    displayName: 'くうご',
  },
} as const

export type FamilyKey = keyof typeof FAMILY
export type Family = Record<FamilyKey, Member>

// 4人を登録し、登録した行を返す
export async function seedFamily(db: TestDb['db']): Promise<Family> {
  // 1人ずつ登録する（登録の日時がこの順に並ぶ）
  const rows: Member[] = []
  for (const values of Object.values(FAMILY)) {
    rows.push(...(await db.insert(members).values(values).returning()))
  }
  const byEmail = (email: string) => {
    const row = rows.find((r) => r.email === email)
    if (!row) throw new Error(`${email} が登録されていない`)
    return row
  }
  return {
    father: byEmail(FAMILY.father.email),
    mother: byEmail(FAMILY.mother.email),
    seigo: byEmail(FAMILY.seigo.email),
    kugo: byEmail(FAMILY.kugo.email),
  }
}

// その家族の Authorization ヘッダー
export async function authHeader(who: FamilyKey): Promise<Record<string, string>> {
  const { authUserId, email } = FAMILY[who]
  return { Authorization: `Bearer ${await signTestToken({ sub: authUserId, email })}` }
}
