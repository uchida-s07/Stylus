import { memberListResponseSchema } from '@stylus/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMoneyTestApp, type MoneyTestApp } from '../../test/money'

// GET /members（請求先・精算の相手を選ぶため。AC ではない）
describe('GET /members', () => {
  let t: MoneyTestApp

  beforeEach(async () => {
    t = await createMoneyTestApp()
  })

  afterEach(async () => {
    await t.close()
  })

  it('家族全員の ID・表示名・親かどうかだけを、登録の順に返す（メールアドレスなどは返さない）', async () => {
    const res = await t.call('kugo', 'GET', '/members')
    expect(res.status).toBe(200)
    const body: unknown = await res.json()
    const { members } = memberListResponseSchema.parse(body)
    expect(members).toEqual([
      { id: t.family.father.id, displayName: '父', isParent: true },
      { id: t.family.mother.id, displayName: '母', isParent: true },
      { id: t.family.seigo.id, displayName: 'せいご', isParent: false },
      { id: t.family.kugo.id, displayName: 'くうご', isParent: false },
    ])
    expect(JSON.stringify(body)).not.toContain('@example.com')
    for (const m of (body as { members: object[] }).members) {
      expect(Object.keys(m).sort()).toEqual(['displayName', 'id', 'isParent'])
    }
  })
})
