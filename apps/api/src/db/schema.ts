import { sql } from 'drizzle-orm'
import { boolean, check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// 空白とみなす文字：半角空白・タブ・改行と全角空白（U+3000）
// [[:space:]] はロケール次第で全角空白を含まないため、文字を明示する
const BLANK_CHARS = sql.raw(`E' \\t\\r\\n\\u3000'`)

// 家族（design.md「データモデル」）
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
)
