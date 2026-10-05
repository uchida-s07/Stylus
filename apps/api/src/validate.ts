import type { ApiError } from '@stylus/shared'
import type { MiddlewareHandler } from 'hono'
import { validator } from 'hono/validator'
import { z } from 'zod'
import type { AppHono } from './env'
import { apiError } from './errors'

// Zod の失敗を 400 invalid_input にする。項目ごとに最初の知らせを fields に入れる
export function invalidInput(error: z.ZodError): ApiError {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : '_'
    fields[key] ??= issue.message
  }
  return { error: { ...apiError('invalid_input', '入力が正しくありません').error, fields } }
}

// 本文（JSON）を Zod で検証する。スキーマが「今日」などに依るときは関数で渡す
// 画面の Hono RPC に入力の型が届くよう、入出力の型を明示する（@hono/zod-validator と同じ形）
// （validator の推論は Zod の出力の型を入力の型としても扱うため、型を付け直す）
type Validated<Target extends string, In, Out, P extends string> = MiddlewareHandler<
  AppHono,
  P,
  { in: { [K in Target]: In }; out: { [K in Target]: Out } }
>

export function jsonBody<T extends z.ZodType, P extends string = string>(schema: T | (() => T)) {
  return validator('json', (value, c) => {
    const s = schema instanceof z.ZodType ? schema : schema()
    const result = s.safeParse(value)
    if (!result.success) return c.json(invalidInput(result.error), 400)
    return result.data
  }) as unknown as Validated<'json', z.input<T>, z.output<T>, P>
}

// クエリを Zod で検証する
export function queryInput<T extends z.ZodType, P extends string = string>(schema: T) {
  return validator('query', (value, c) => {
    const result = schema.safeParse(value)
    if (!result.success) return c.json(invalidInput(result.error), 400)
    return result.data
  }) as unknown as Validated<'query', { [K in keyof z.input<T>]?: string }, z.output<T>, P>
}

// パスの :id。uuid の形でなければ、無いものとして 404 not_found
export function idParam<P extends string = string>(notFoundMessage: string) {
  return validator('param', (value, c) => {
    const id = value['id']
    if (!id || !z.uuid().safeParse(id).success) {
      return c.json(apiError('not_found', notFoundMessage), 404)
    }
    return { id }
  }) as unknown as Validated<'param', { id: string }, { id: string }, P>
}

// Postgres のエラーコード（SQLSTATE）。Drizzle は元のエラーを cause に入れる
export function pgErrorCode(error: unknown): string | undefined {
  const e = error as { code?: unknown; cause?: { code?: unknown } }
  const code = typeof e?.code === 'string' ? e.code : e?.cause?.code
  return typeof code === 'string' ? code : undefined
}

export const PG = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  // ON DELETE RESTRICT の違反
  RESTRICT_VIOLATION: '23001',
} as const
