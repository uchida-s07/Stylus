import { z } from 'zod'
import { charCount, trimBlank } from './money'

// ---- 車（spec 003） ----
// 文字列の扱い（空白の定義・前後の空白を除いてから数える）はお金と揃える

// ---- 知らせ ----
export const CAR_MESSAGES = {
  required: '入力してください',
  maxLength: (max: number) => `${max}文字以内で入力してください`,
  duplicateName: '同じ名前の車があります',
  endNotAfterStart: '終了は開始より後にしてください',
  endPassed: '終了の日時が過ぎています',
  // 予約を入れる・直すときに選んだ車が削除されていた（fields.carId）、車の操作で車が無い
  carNotFound: 'この車は見つかりません。',
  carUnavailable: 'この車は今は予約できません。選び直してください',
  carInUse: 'この車には予約があるため削除できません。使わないにしてください。',
  reservationNotFound: 'この予約は見つかりません。',
  alreadyRegistered: 'この予約はすでに登録されています。予定で確かめて、必要なら直してください。',
  changed: '予約の中身が変わりました。もう一度確かめてください。',
  started: 'この予約はもう始まっています。もう一度開いてください。',
  ended: 'この予約はもう終わっているため直せません。',
  cancelStarted: 'この予約はもう始まっているため取り消せません。終了の日時を直してください。',
  forbidden: '自分の予約だけを直す・取り消すことができます',
  shapeMismatch: '車と開始日時は両方とも送るか、両方とも送らないでください',
} as const

export const CAR_NAME_MAX = 20
export const DESTINATION_MAX = 50
export const RESERVATION_MEMO_MAX = 500
// 履歴の1回に出す件数（CAR-F-008）
export const HISTORY_PAGE_SIZE = 30

// 前後の空白を除いて 1〜max 文字
function requiredText(max: number) {
  return z
    .string({ error: CAR_MESSAGES.required })
    .transform(trimBlank)
    .pipe(
      z
        .string()
        .min(1, CAR_MESSAGES.required)
        .refine((v) => charCount(v) <= max, CAR_MESSAGES.maxLength(max)),
    )
}

// 任意の文字列：空（空白だけを含む）・null なら「無し」（null）
function optionalText(max: number) {
  return z
    .string()
    .nullable()
    .transform((v) => {
      if (v === null) return null
      const trimmed = trimBlank(v)
      return trimmed === '' ? null : trimmed
    })
    .refine((v) => v === null || charCount(v) <= max, CAR_MESSAGES.maxLength(max))
}

// 日時：オフセットつきの ISO 8601。分まで（秒・ミリ秒が0）
const dateTimeSchema = z.iso
  .datetime({ offset: true, error: CAR_MESSAGES.required })
  .transform((v) => new Date(v))
  .refine(
    (d) => d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0,
    '分までで入力してください',
  )

const versionSchema = z.number().int().min(1)

// ---- 入力：車 ----

// POST /cars（CAR-F-001）
export const carInputSchema = z.object({ name: requiredText(CAR_NAME_MAX) })
export type CarInput = z.input<typeof carInputSchema>

// PATCH /cars/:id（CAR-F-002・009）。名前と使う／使わないのどちらか1つだけを送る（tasks.md D-4）
export const carPatchSchema = z
  .object({ name: requiredText(CAR_NAME_MAX).optional(), isActive: z.boolean().optional() })
  .refine((v) => (v.name === undefined) !== (v.isActive === undefined), {
    message: '名前と使う／使わないのどちらか1つだけを送ってください',
    path: ['_'],
  })
export type CarPatch = z.input<typeof carPatchSchema>

// ---- 入力：予約 ----

// 終了は開始より後、（まだ始まっていない予約は）終了は今より後
function checkPeriod(
  ctx: z.RefinementCtx,
  startsAt: Date | undefined,
  endsAt: Date,
  now: Date | undefined,
) {
  if (startsAt && endsAt.getTime() <= startsAt.getTime()) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: CAR_MESSAGES.endNotAfterStart })
  } else if (now && endsAt.getTime() <= now.getTime()) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: CAR_MESSAGES.endPassed })
  }
}

// POST /car-reservations（CAR-F-004）。now は API の時計（「終了の日時が過ぎています」の判定）
export function createReservationInputSchema(now: Date) {
  return z
    .object({
      carId: z.uuid({ error: CAR_MESSAGES.required }),
      startsAt: dateTimeSchema,
      endsAt: dateTimeSchema,
      destination: optionalText(DESTINATION_MAX)
        .optional()
        .transform((v) => v ?? null),
      memo: optionalText(RESERVATION_MEMO_MAX)
        .optional()
        .transform((v) => v ?? null),
      requestId: z.uuid(),
    })
    .superRefine((v, ctx) => checkPeriod(ctx, v.startsAt, v.endsAt, now))
}
export type ReservationInput = z.input<ReturnType<typeof createReservationInputSchema>>

// PATCH /car-reservations/:id（CAR-F-006）。送る項目の形で2つに分ける（design.md「予約の状態と操作の可否」）
// - 車・開始日時を両方含む：まだ始まっていない予約の直し方（kind: not_started）
// - 両方含まない：使用中の予約の直し方（kind: in_use。終了は今より前でもよい）
// - 片方だけ：形が違うので 400（tasks.md D-5。予約の状態にかかわらない）
// 終了・行き先・メモ・版は毎回すべて送る（tasks.md D-4。行き先・メモの「無し」は null か空の文字列）
export function createReservationEditSchema(now: Date) {
  return z
    .object({
      carId: z.uuid({ error: CAR_MESSAGES.required }).optional(),
      startsAt: dateTimeSchema.optional(),
      endsAt: dateTimeSchema,
      destination: optionalText(DESTINATION_MAX),
      memo: optionalText(RESERVATION_MEMO_MAX),
      version: versionSchema,
    })
    .superRefine((v, ctx) => {
      if ((v.carId === undefined) !== (v.startsAt === undefined)) {
        ctx.addIssue({ code: 'custom', path: ['_'], message: CAR_MESSAGES.shapeMismatch })
        return
      }
      // 使用中の予約の直し方は、保存してある開始日時と比べる（tasks.md D-2。car/update.ts）
      if (v.startsAt) checkPeriod(ctx, v.startsAt, v.endsAt, now)
    })
    .transform((v) => {
      const common = {
        endsAt: v.endsAt,
        destination: v.destination,
        memo: v.memo,
        version: v.version,
      }
      return v.carId !== undefined && v.startsAt !== undefined
        ? { kind: 'not_started' as const, carId: v.carId, startsAt: v.startsAt, ...common }
        : { kind: 'in_use' as const, ...common }
    })
}
export type ReservationEditInput = z.input<ReturnType<typeof createReservationEditSchema>>
export type ReservationEdit = z.output<ReturnType<typeof createReservationEditSchema>>

// 履歴のカーソル：最後の行の「終了日時（ISO 8601）_ID」
const cursorSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[0-9a-f-]{36}$/)
  .transform((v) => {
    const at = v.lastIndexOf('_')
    return { endsAt: new Date(v.slice(0, at)), id: v.slice(at + 1) }
  })
  .refine((c) => !Number.isNaN(c.endsAt.getTime()) && z.uuid().safeParse(c.id).success)

export function toHistoryCursor(endsAt: string, id: string): string {
  return `${new Date(endsAt).toISOString()}_${id}`
}

// GET /car-reservations?view=upcoming|past&before=<カーソル>
export const reservationListQuerySchema = z.object({
  view: z.enum(['upcoming', 'past']).default('upcoming'),
  before: cursorSchema.optional(),
})
export type ReservationListQuery = z.input<typeof reservationListQuerySchema>

// ---- 応答 ----

export const carSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isActive: z.boolean(),
})
export type Car = z.infer<typeof carSchema>

// 車の管理の一覧の1行
export const carListItemSchema = carSchema.extend({
  // 予約が1件でもあるか（「削除」を出すか。CAR-F-003）
  hasReservations: z.boolean(),
  // これからの予約の件数（「使わないにする」の確認に出す。CAR-F-002）
  upcomingCount: z.number().int(),
})
export type CarListItem = z.infer<typeof carListItemSchema>

// GET /cars（名前の順）
export const carListResponseSchema = z.object({ cars: z.array(carListItemSchema) })
export type CarListResponse = z.infer<typeof carListResponseSchema>

// 予定・履歴の1行
export const reservationSchema = z.object({
  id: z.uuid(),
  car: carSchema,
  member: z.object({ id: z.uuid(), displayName: z.string() }),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  destination: z.string().nullable(),
  version: z.number().int(),
})
export type Reservation = z.infer<typeof reservationSchema>

// GET /car-reservations/:id（メモを含む）
export const reservationDetailSchema = reservationSchema.extend({
  memo: z.string().nullable(),
  // 自分の予約か（「直す」「取り消す」の出し分けに使う。見た目だけ）
  isMine: z.boolean(),
})
export type ReservationDetail = z.infer<typeof reservationDetailSchema>

// GET /car-reservations。nextCursor は履歴に続きがあるときだけ（予定は常に null）
export const reservationListResponseSchema = z.object({
  reservations: z.array(reservationSchema),
  nextCursor: z.string().nullable(),
})
export type ReservationListResponse = z.infer<typeof reservationListResponseSchema>
