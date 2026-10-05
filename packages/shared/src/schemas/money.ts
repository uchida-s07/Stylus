import { z } from 'zod'
import {
  BILL_EVENT_KINDS,
  BILL_STATUSES,
  SETTLEMENT_STATUSES,
  type BillSide,
  type SettlementSide,
} from '../money/transitions'

// ---- 文字列の扱い（tasks.md D-1） ----
// 空白：半角空白・タブ・改行と全角空白（U+3000）。家族の表示名（AUTH-F-001）と揃える
// 全角空白は文字コードで書く（ソースに全角空白を置くと見分けにくい）
const BLANK_CHARS = ` \t\r\n${String.fromCharCode(0x3000)}`
const BLANK_EDGES = new RegExp(`^[${BLANK_CHARS}]+|[${BLANK_CHARS}]+$`, 'g')

// 前後の空白を除く
export function trimBlank(value: string): string {
  return value.replace(BLANK_EDGES, '')
}

// 見た目の1文字を1と数える（コードポイント。DB の char_length と同じ）
export function charCount(value: string): number {
  return [...value].length
}

// ---- 入力の検証の知らせ ----
export const MONEY_MESSAGES = {
  required: '入力してください',
  reasonRequired: '理由を入力してください',
  amount: '1円以上9,999,999円以下の整数で入力してください',
  maxLength: (max: number) => `${max}文字以内で入力してください`,
  futureDate: '今日より後の日付は選べません',
  tooOldDate: '2020-01-01 以降の日付を選んでください',
  reselect: '選び直してください',
  categoryNotFound: 'カテゴリーが見つかりません。選び直してください',
} as const

export const MIN_OCCURRED_ON = '2020-01-01'
export const MAX_AMOUNT = 9_999_999

// 前後の空白を除いて 1〜max 文字
function requiredText(max: number, requiredMessage: string = MONEY_MESSAGES.required) {
  return z
    .string({ error: requiredMessage })
    .transform(trimBlank)
    .pipe(
      z
        .string()
        .min(1, requiredMessage)
        .refine((v) => charCount(v) <= max, MONEY_MESSAGES.maxLength(max)),
    )
}

// メモ：空（空白だけを含む）なら「メモなし」（null）
const memoSchema = z
  .string()
  .nullish()
  .transform((v) => {
    if (v == null) return null
    const trimmed = trimBlank(v)
    return trimmed === '' ? null : trimmed
  })
  .refine((v) => v === null || charCount(v) <= 500, MONEY_MESSAGES.maxLength(500))

const amountSchema = z
  .number({ error: MONEY_MESSAGES.required })
  .int(MONEY_MESSAGES.amount)
  .min(1, MONEY_MESSAGES.amount)
  .max(MAX_AMOUNT, MONEY_MESSAGES.amount)

// 発生日：2020-01-01〜今日（日本時間）
function occurredOnSchema(today: string) {
  return z.iso
    .date({ error: MONEY_MESSAGES.required })
    .refine((v) => v >= MIN_OCCURRED_ON, MONEY_MESSAGES.tooOldDate)
    .refine((v) => v <= today, MONEY_MESSAGES.futureDate)
}

const versionSchema = z.number().int().min(1)

// 名義：自分か「家庭」（「家庭」は親だけ）
export const asSchema = z.enum(['self', 'household'])
export type As = z.infer<typeof asSchema>

// 当事者の指定：家族の ID か「家庭」
export const partyRefSchema = z.union([z.literal('household'), z.uuid()], {
  error: MONEY_MESSAGES.reselect,
})
export type PartyRef = z.infer<typeof partyRefSchema>

// ---- 入力 ----

// POST /bills（MONEY-F-001）。today は日本時間の今日（toJstDate）
export function createBillInputSchema(today: string) {
  return z.object({
    as: asSchema.default('self'),
    to: z.union([z.literal('household'), z.uuid()], { error: MONEY_MESSAGES.required }),
    amount: amountSchema,
    categoryId: z.uuid({ error: MONEY_MESSAGES.required }),
    title: requiredText(50),
    memo: memoSchema,
    occurredOn: occurredOnSchema(today),
    requestId: z.uuid(),
  })
}
export type BillInput = z.input<ReturnType<typeof createBillInputSchema>>

// PATCH /bills/:id（MONEY-F-002）。請求する側・請求先は直せない
export function createBillEditSchema(today: string) {
  return z.object({
    version: versionSchema,
    amount: amountSchema,
    categoryId: z.uuid({ error: MONEY_MESSAGES.required }),
    title: requiredText(50),
    memo: memoSchema,
    occurredOn: occurredOnSchema(today),
  })
}
export type BillEditInput = z.input<ReturnType<typeof createBillEditSchema>>

// POST /bills/:id/{pay,cancel,confirm,revert}
export const billActionInputSchema = z.object({ version: versionSchema })
export type BillActionInput = z.input<typeof billActionInputSchema>

// POST /bills/:id/return（MONEY-F-008）
export const billReturnInputSchema = z.object({
  version: versionSchema,
  reason: requiredText(200, MONEY_MESSAGES.reasonRequired),
})
export type BillReturnInput = z.input<typeof billReturnInputSchema>

// POST /bill-categories（MONEY-F-013）
export const categoryInputSchema = z.object({ name: requiredText(20) })
export type CategoryInput = z.input<typeof categoryInputSchema>

// GET /settlements/preview（MONEY-F-010）
export const settlementQuerySchema = z.object({
  as: asSchema.default('self'),
  counterpart: partyRefSchema,
})
export type SettlementQuery = z.input<typeof settlementQuerySchema>

// POST /settlements（MONEY-F-011、tasks.md D-3）
// amount は払う側から受け取る側への額。payer は画面が見ていた払う側
export const settlementInputSchema = z.object({
  as: asSchema.default('self'),
  counterpart: partyRefSchema,
  bills: z.array(z.object({ id: z.uuid(), version: versionSchema })).min(1),
  amount: z.number().int().min(0),
  payer: z.enum(['self', 'counterpart']),
})
export type SettlementInput = z.input<typeof settlementInputSchema>

// POST /settlements/:id/{confirm,revert}：送るものは無い

// ---- 応答 ----

// 当事者：memberId が null なら「家庭」
export const partySchema = z.object({ memberId: z.uuid().nullable(), name: z.string() })
export type Party = z.infer<typeof partySchema>

export const HOUSEHOLD_NAME = '家庭'

export const categorySchema = z.object({ id: z.uuid(), name: z.string() })
export type Category = z.infer<typeof categorySchema>
export const categoryListResponseSchema = z.object({ categories: z.array(categorySchema) })
export type CategoryListResponse = z.infer<typeof categoryListResponseSchema>

export const memberSummarySchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  isParent: z.boolean(),
})
export type MemberSummary = z.infer<typeof memberSummarySchema>
export const memberListResponseSchema = z.object({ members: z.array(memberSummarySchema) })
export type MemberListResponse = z.infer<typeof memberListResponseSchema>

export const billStatusSchema = z.enum(BILL_STATUSES)
export const billSideSchema = z.enum(['from', 'to'] satisfies BillSide[])
export const settlementStatusSchema = z.enum(SETTLEMENT_STATUSES)
export const settlementSideSchema = z.enum(['payer', 'receiver'] satisfies SettlementSide[])

// 一覧の1行
export const billSummarySchema = z.object({
  id: z.uuid(),
  from: partySchema,
  to: partySchema,
  amount: z.number().int(),
  category: categorySchema,
  title: z.string(),
  occurredOn: z.iso.date(),
  status: billStatusSchema,
  version: z.number().int(),
  settlementId: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
})
export type BillSummary = z.infer<typeof billSummarySchema>

// 経過の1行（MONEY-F-005）
export const billEventSchema = z.object({
  kind: z.enum(BILL_EVENT_KINDS),
  actorName: z.string(),
  reason: z.string().nullable(),
  settlement: z
    .object({ id: z.uuid(), amount: z.number().int(), payer: partySchema, receiver: partySchema })
    .nullable(),
  createdAt: z.iso.datetime({ offset: true }),
})
export type BillEvent = z.infer<typeof billEventSchema>

// GET /bills/:id
export const billDetailSchema = billSummarySchema.extend({
  memo: z.string().nullable(),
  events: z.array(billEventSchema),
  // 自分がどの側か（ボタンの出し分けに使う。見た目だけ）
  sides: z.array(billSideSchema),
})
export type BillDetail = z.infer<typeof billDetailSchema>

const totalsSchema = z.object({ pay: z.number().int(), receive: z.number().int() })

// 受け取り待ちの精算（MONEY-F-004）
export const pendingSettlementSchema = z.object({
  id: z.uuid(),
  payer: partySchema,
  receiver: partySchema,
  amount: z.number().int(),
  paidAt: z.iso.datetime({ offset: true }),
  side: settlementSideSchema,
})
export type PendingSettlement = z.infer<typeof pendingSettlementSchema>

// GET /bills?view=open|closed
export const billListResponseSchema = z.object({
  bills: z.array(billSummarySchema),
  totals: z.object({
    self: totalsSchema,
    // 親にだけ返す
    household: totalsSchema.nullable(),
  }),
  pendingSettlements: z.array(pendingSettlementSchema),
})
export type BillListResponse = z.infer<typeof billListResponseSchema>

export const billListQuerySchema = z.object({ view: z.enum(['open', 'closed']).default('open') })

// GET /settlements/preview
export const settlementPreviewSchema = z.object({
  self: partySchema,
  counterpart: partySchema,
  bills: z.array(billSummarySchema),
  selfRequestedTotal: z.number().int(),
  counterpartRequestedTotal: z.number().int(),
  amount: z.number().int(),
  payer: z.enum(['self', 'counterpart']).nullable(),
})
export type SettlementPreview = z.infer<typeof settlementPreviewSchema>

// GET /settlements/:id
export const settlementDetailSchema = z.object({
  id: z.uuid(),
  payer: partySchema,
  receiver: partySchema,
  amount: z.number().int(),
  status: settlementStatusSchema,
  paidByName: z.string(),
  paidAt: z.iso.datetime({ offset: true }),
  confirmedByName: z.string().nullable(),
  confirmedAt: z.iso.datetime({ offset: true }).nullable(),
  revertedByName: z.string().nullable(),
  revertedAt: z.iso.datetime({ offset: true }).nullable(),
  bills: z.array(billSummarySchema),
  sides: z.array(settlementSideSchema),
})
export type SettlementDetail = z.infer<typeof settlementDetailSchema>
