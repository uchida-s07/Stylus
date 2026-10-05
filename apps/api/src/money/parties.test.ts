import { describe, expect, it } from 'vitest'
import type { Member } from '../env'
import { billSidesOf, isPartyMember, settlementSidesOf } from './parties'

// 関係者・側の判定（design.md「当事者（『家庭』）の表し方」。AC ではない）
function member(id: string, isParent: boolean): Member {
  return {
    id,
    authUserId: null,
    email: `${id}@example.com`,
    displayName: id,
    isAdmin: false,
    isParent,
    isCook: false,
    createdAt: new Date(),
  }
}

const mother = member('mother', true)
const seigo = member('seigo', false)

describe('関係者と側', () => {
  it('家族の当事者はその人だけ、「家庭」は親だけが関係者', () => {
    expect(isPartyMember(seigo, 'seigo')).toBe(true)
    expect(isPartyMember(mother, 'seigo')).toBe(false)
    expect(isPartyMember(mother, null)).toBe(true)
    expect(isPartyMember(seigo, null)).toBe(false)
  })

  it('請求の側', () => {
    expect(billSidesOf(seigo, 'seigo', 'mother')).toEqual(['from'])
    expect(billSidesOf(mother, 'seigo', 'mother')).toEqual(['to'])
    expect(billSidesOf(mother, 'seigo', null)).toEqual(['to'])
    expect(billSidesOf(mother, null, 'kugo')).toEqual(['from'])
    expect(billSidesOf(seigo, null, 'kugo')).toEqual([])
    expect(billSidesOf(seigo, 'father', 'mother')).toEqual([])
  })

  it('精算の側', () => {
    expect(settlementSidesOf(mother, 'mother', 'seigo')).toEqual(['payer'])
    expect(settlementSidesOf(seigo, 'mother', 'seigo')).toEqual(['receiver'])
    expect(settlementSidesOf(mother, null, 'seigo')).toEqual(['payer'])
    expect(settlementSidesOf(seigo, 'mother', 'kugo')).toEqual([])
  })
})
