import type { BillSide, SettlementSide } from '@stylus/shared'
import { eq, isNull, or, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { Member } from '../env'

// 当事者：家族の ID か、「家庭」（null）。ADR-0007
export type PartyId = string | null

// その家族が当事者 party の関係者か（当事者が家族ならその人、「家庭」なら親）
export function isPartyMember(member: Member, party: PartyId): boolean {
  return party === null ? member.isParent : party === member.id
}

// 請求での自分の側（請求する側 from・請求先側 to）。関係者でなければ空
export function billSidesOf(member: Member, from: PartyId, to: PartyId): BillSide[] {
  const sides: BillSide[] = []
  if (isPartyMember(member, from)) sides.push('from')
  if (isPartyMember(member, to)) sides.push('to')
  return sides
}

// 精算での自分の側（払う側 payer・受け取る側 receiver）
export function settlementSidesOf(
  member: Member,
  payer: PartyId,
  receiver: PartyId,
): SettlementSide[] {
  const sides: SettlementSide[] = []
  if (isPartyMember(member, payer)) sides.push('payer')
  if (isPartyMember(member, receiver)) sides.push('receiver')
  return sides
}

// 関係者だけに絞る WHERE（MONEY-N-001）：当事者のどちらかが自分、または自分が親でどちらかが「家庭」
export function relatedTo(member: Member, a: AnyPgColumn, b: AnyPgColumn): SQL {
  const conditions = [eq(a, member.id), eq(b, member.id)]
  if (member.isParent) conditions.push(isNull(a), isNull(b))
  return or(...conditions) as SQL
}

// 当事者が party の行に絞る WHERE（null は「家庭」）
export function partyIs(column: AnyPgColumn, party: PartyId): SQL {
  return party === null ? isNull(column) : eq(column, party)
}
