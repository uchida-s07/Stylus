import { categoryInputSchema, type Category, type CategoryListResponse } from '@stylus/shared'
import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { billCategories } from '../db/schema'
import type { AppHono } from '../env'
import { apiError } from '../errors'
import { idParam, jsonBody, PG, pgErrorCode } from '../validate'

const NOT_FOUND = 'このカテゴリーは見つかりません'

// カテゴリー（MONEY-F-013・014）。家族の誰でも見られ、追加・削除できる
export const billCategoriesRoute = new Hono<AppHono>()
  .get('/', async (c) => {
    const rows = await c.var.db
      .select({ id: billCategories.id, name: billCategories.name })
      .from(billCategories)
      .orderBy(asc(billCategories.createdAt), asc(billCategories.id))
    return c.json({ categories: rows } satisfies CategoryListResponse)
  })
  .post('/', jsonBody(categoryInputSchema), async (c) => {
    const { name } = c.req.valid('json')
    try {
      const [row] = await c.var.db
        .insert(billCategories)
        .values({ name })
        .returning({ id: billCategories.id, name: billCategories.name })
      // insert … returning は1行を返す
      return c.json(row as Category, 201)
    } catch (error) {
      if (pgErrorCode(error) === PG.UNIQUE_VIOLATION) {
        return c.json(apiError('duplicate_name', '同じ名前のカテゴリーがあります'), 409)
      }
      throw error
    }
  })
  .delete('/:id', idParam(NOT_FOUND), async (c) => {
    const { id } = c.req.valid('param')
    try {
      // 請求で使われていれば外部キー（RESTRICT）が止める。確認を開いた後に登録された請求も同じ
      const deleted = await c.var.db
        .delete(billCategories)
        .where(eq(billCategories.id, id))
        .returning({ id: billCategories.id })
      if (deleted.length === 0) return c.json(apiError('not_found', NOT_FOUND), 404)
      return c.body(null, 204)
    } catch (error) {
      const code = pgErrorCode(error)
      if (code === PG.RESTRICT_VIOLATION || code === PG.FOREIGN_KEY_VIOLATION) {
        return c.json(
          apiError('in_use', 'このカテゴリーは請求で使われているため削除できません'),
          409,
        )
      }
      throw error
    }
  })
