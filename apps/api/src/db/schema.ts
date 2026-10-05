import { BILL_EVENT_KINDS, BILL_STATUSES, SETTLEMENT_STATUSES } from '@stylus/shared'
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

// 空白とみなす文字：半角空白・タブ・改行と全角空白（U+3000）
// [[:space:]] はロケール次第で全角空白を含まないため、文字を明示する
const BLANK_CHARS = sql.raw(`E' \\t\\r\\n\\u3000'`)

// 家族（design.md「データモデル」）
// public のテーブルはすべて RLS を有効にし、ポリシーは作らない（COMMON-N-003。Data API から読み書きさせない）
export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Supabase Auth の利用者 ID。家族の登録の手順で埋める
    authUserId: uuid('auth_user_id').unique(),
    email: text('email').notNull().unique(),
    displayName: text('display_name').notNull(),
    isAdmin: boolean('is_admin').notNull().default(false),
    isParent: boolean('is_parent').notNull().default(false),
    isCook: boolean('is_cook').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('members_email_not_empty', sql`${t.email} <> ''`),
    // 手作業で大文字を入れたら拒否する（照合は小文字で行う）
    check('members_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check('members_display_name_not_blank', sql`btrim(${t.displayName}, ${BLANK_CHARS}) <> ''`),
  ],
).enableRLS()

// ---- お金（spec 002。design.md「データモデル」、ADR-0007・0008） ----
// 当事者（請求する側・請求先、精算の払う側・受け取る側）は members.id で表し、「家庭」は NULL（ADR-0007）
// members を指す外部キーはすべて RESTRICT（お金の記録がある家族の行は消せない）
// 文字列は前後の空白を除いた値を保存し、文字数は char_length（コードポイント）で数える（tasks.md D-1）

const memberRef = () => members.id
const RESTRICT = { onDelete: 'restrict' } as const

// 前後の空白を除いた値で、長さが min〜max
function trimmedText(column: AnyPgColumn, min: number, max: number) {
  return sql`${column} = btrim(${column}, ${BLANK_CHARS}) and char_length(${column}) between ${sql.raw(String(min))} and ${sql.raw(String(max))}`
}

// 状態・経過の種類の一覧は packages/shared の状態遷移の表と同じものを使う

function oneOf(column: AnyPgColumn, values: readonly string[]) {
  return sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(', '))})`
}

// カテゴリー（MONEY-F-013・014）
export const billCategories = pgTable(
  'bill_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // 前後の空白を除いて保存するので、名前の一意で「前後の空白を除いて同じ名前」を防げる
    name: text('name').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('bill_categories_name_valid', trimmedText(t.name, 1, 20))],
).enableRLS()

// 精算（MONEY-F-011・012、F-009 の精算ごと戻す）
export const settlements = pgTable(
  'settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    payerMemberId: uuid('payer_member_id').references(memberRef, RESTRICT),
    receiverMemberId: uuid('receiver_member_id').references(memberRef, RESTRICT),
    amount: integer('amount').notNull(),
    status: text('status', { enum: SETTLEMENT_STATUSES }).notNull().default('paid'),
    paidBy: uuid('paid_by').notNull().references(memberRef, RESTRICT),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
    confirmedBy: uuid('confirmed_by').references(memberRef, RESTRICT),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    revertedBy: uuid('reverted_by').references(memberRef, RESTRICT),
    revertedAt: timestamp('reverted_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'settlements_parties_valid',
      sql`${t.payerMemberId} is distinct from ${t.receiverMemberId}`,
    ),
    check('settlements_amount_valid', sql`${t.amount} >= 0`),
    check('settlements_status_valid', oneOf(t.status, SETTLEMENT_STATUSES)),
    check(
      'settlements_confirmed_consistent',
      sql`(${t.status} = 'confirmed') = (${t.confirmedBy} is not null and ${t.confirmedAt} is not null)`,
    ),
    check(
      'settlements_reverted_consistent',
      sql`(${t.status} = 'reverted') = (${t.revertedBy} is not null and ${t.revertedAt} is not null)`,
    ),
    index('settlements_payer_idx').on(t.payerMemberId, t.status),
    index('settlements_receiver_idx').on(t.receiverMemberId, t.status),
  ],
).enableRLS()

// 請求（MONEY-F-001〜009）
export const bills = pgTable(
  'bills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // 請求する側・請求先（NULL＝家庭）
    fromMemberId: uuid('from_member_id').references(memberRef, RESTRICT),
    toMemberId: uuid('to_member_id').references(memberRef, RESTRICT),
    amount: integer('amount').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => billCategories.id, RESTRICT),
    title: text('title').notNull(),
    memo: text('memo'),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    status: text('status', { enum: BILL_STATUSES }).notNull().default('requested'),
    // 更新のたびに1増やす（ADR-0008）
    version: integer('version').notNull().default(1),
    settlementId: uuid('settlement_id').references(() => settlements.id, RESTRICT),
    createdBy: uuid('created_by').notNull().references(memberRef, RESTRICT),
    // 二重登録の防止（画面が入力を開いたときに作る）
    requestId: uuid('request_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 両方が NULL（家庭→家庭）にも、同じ家族にもならない
    check('bills_parties_valid', sql`${t.fromMemberId} is distinct from ${t.toMemberId}`),
    check('bills_amount_valid', sql`${t.amount} between 1 and 9999999`),
    check('bills_title_valid', trimmedText(t.title, 1, 50)),
    check('bills_memo_valid', sql`${t.memo} is null or (${trimmedText(t.memo, 1, 500)})`),
    check('bills_occurred_on_valid', sql`${t.occurredOn} >= '2020-01-01'`),
    check('bills_status_valid', oneOf(t.status, BILL_STATUSES)),
    // 精算に入るのは支払済・確認済の請求だけ
    check(
      'bills_settlement_status',
      sql`${t.settlementId} is null or ${t.status} in ('paid', 'confirmed')`,
    ),
    unique('bills_created_by_request_id_unique').on(t.createdBy, t.requestId),
    index('bills_from_idx').on(t.fromMemberId, t.status),
    index('bills_to_idx').on(t.toMemberId, t.status),
    index('bills_settlement_idx').on(t.settlementId),
  ],
).enableRLS()

// 請求の経過（MONEY-F-005）
export const billEvents = pgTable(
  'bill_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // 足した順（同じ日時の経過を並べるため）
    seq: bigint('seq', { mode: 'number' }).notNull().generatedAlwaysAsIdentity(),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id, RESTRICT),
    kind: text('kind', { enum: BILL_EVENT_KINDS }).notNull(),
    actorMemberId: uuid('actor_member_id').notNull().references(memberRef, RESTRICT),
    // 差し戻しの理由（差し戻しのときだけ）
    reason: text('reason'),
    settlementId: uuid('settlement_id').references(() => settlements.id, RESTRICT),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('bill_events_kind_valid', oneOf(t.kind, BILL_EVENT_KINDS)),
    check(
      'bill_events_reason_valid',
      sql`case when ${t.kind} = 'returned' then ${t.reason} is not null and (${trimmedText(t.reason, 1, 200)}) else ${t.reason} is null end`,
    ),
    check(
      'bill_events_settlement_valid',
      sql`(${t.kind} like 'settle%') = (${t.settlementId} is not null)`,
    ),
    index('bill_events_bill_idx').on(t.billId, t.createdAt, t.seq),
  ],
).enableRLS()
