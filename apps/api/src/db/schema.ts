import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// 家族（design.md「データモデル」）
export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Supabase Auth の利用者 ID。家族の登録の手順で埋める
  authUserId: uuid('auth_user_id'),
  email: text('email'),
  displayName: text('display_name'),
  isAdmin: boolean('is_admin').notNull().default(false),
  isParent: boolean('is_parent').notNull().default(false),
  isCook: boolean('is_cook').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
