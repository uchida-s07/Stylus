import { describe, expect, it } from 'vitest'
import {
  CAR_MESSAGES,
  carInputSchema,
  carPatchSchema,
  createReservationEditSchema,
  createReservationInputSchema,
  reservationListQuerySchema,
  toHistoryCursor,
} from './car'

// 入力の検証の細部（AC は API・画面のテストで確かめる）
// 今：日本時間 2026-10-07 20:00
const NOW = new Date('2026-10-07T11:00:00Z')
const CAR_ID = '00000000-0000-4000-8000-000000000001'
const valid = {
  carId: CAR_ID,
  startsAt: '2026-10-10T00:00:00.000Z',
  endsAt: '2026-10-10T03:00:00.000Z',
  requestId: '00000000-0000-4000-8000-000000000002',
}

function issuesOf(schema: { safeParse(v: unknown): unknown }, input: unknown) {
  const result = schema.safeParse(input) as
    | { success: true }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } }
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((i) => [String(i.path[0] ?? '_'), i.message]))
}

describe('車の名前', () => {
  it('前後の空白（全角空白を含む）を除いた値になる', () => {
    expect(carInputSchema.parse({ name: '　ノア ' }).name).toBe('ノア')
  })

  it('空白だけは「入力してください」、21文字は止める（20文字はよい）', () => {
    expect(issuesOf(carInputSchema, { name: ' 　\t' })).toEqual({ name: CAR_MESSAGES.required })
    expect(issuesOf(carInputSchema, { name: 'あ'.repeat(21) })).toHaveProperty('name')
    expect(issuesOf(carInputSchema, { name: 'あ'.repeat(20) })).toEqual({})
  })
})

describe('車を変える（tasks.md D-4）', () => {
  it('名前だけ・使う／使わないだけはよい', () => {
    expect(carPatchSchema.parse({ name: ' ヴォクシー ' })).toEqual({ name: 'ヴォクシー' })
    expect(carPatchSchema.parse({ isActive: false })).toEqual({ isActive: false })
  })

  it('どちらも無い・両方ある要求は止める', () => {
    expect(carPatchSchema.safeParse({}).success).toBe(false)
    expect(carPatchSchema.safeParse({ name: 'ノア', isActive: true }).success).toBe(false)
  })

  it('名前が空白だけなら name に「入力してください」', () => {
    expect(issuesOf(carPatchSchema, { name: '　' })).toEqual({ name: CAR_MESSAGES.required })
  })
})

describe('予約を入れる', () => {
  const schema = createReservationInputSchema(NOW)

  it('行き先・メモは前後の空白を除き、空白だけ・送らないなら null', () => {
    const parsed = schema.parse({ ...valid, destination: ' 大学　', memo: '　\n' })
    expect(parsed).toMatchObject({ destination: '大学', memo: null })
    expect(schema.parse(valid)).toMatchObject({ destination: null, memo: null })
    expect(schema.parse({ ...valid, destination: null, memo: '' })).toMatchObject({
      destination: null,
      memo: null,
    })
  })

  it('日時は Date になる。秒・ミリ秒のある日時は止める', () => {
    expect(schema.parse(valid).startsAt).toEqual(new Date(valid.startsAt))
    expect(issuesOf(schema, { ...valid, startsAt: '2026-10-10T00:00:30.000Z' })).toHaveProperty(
      'startsAt',
    )
    expect(issuesOf(schema, { ...valid, endsAt: '2026-10-10T03:00:00.001Z' })).toHaveProperty(
      'endsAt',
    )
  })

  it('日本時間のオフセットつきの日時も受け付ける', () => {
    expect(schema.parse({ ...valid, startsAt: '2026-10-10T09:00:00+09:00' }).startsAt).toEqual(
      new Date(valid.startsAt),
    )
  })

  it('車・開始・終了が無ければ、その項目に「入力してください」', () => {
    expect(issuesOf(schema, { requestId: valid.requestId })).toEqual({
      carId: CAR_MESSAGES.required,
      startsAt: CAR_MESSAGES.required,
      endsAt: CAR_MESSAGES.required,
    })
  })

  it('終了が開始と同じか前なら「終了は開始より後にしてください」', () => {
    expect(issuesOf(schema, { ...valid, endsAt: valid.startsAt })).toEqual({
      endsAt: CAR_MESSAGES.endNotAfterStart,
    })
    expect(issuesOf(schema, { ...valid, endsAt: '2026-10-09T23:00:00.000Z' })).toEqual({
      endsAt: CAR_MESSAGES.endNotAfterStart,
    })
  })

  it('終了が今以前なら「終了の日時が過ぎています」。開始は今より前でもよい', () => {
    expect(
      issuesOf(schema, {
        ...valid,
        startsAt: '2026-10-07T09:00:00.000Z',
        endsAt: NOW.toISOString(),
      }),
    ).toEqual({ endsAt: CAR_MESSAGES.endPassed })
    expect(
      issuesOf(schema, {
        ...valid,
        startsAt: '2026-10-07T10:00:00.000Z',
        endsAt: '2026-10-07T11:01:00.000Z',
      }),
    ).toEqual({})
  })

  it('行き先は50文字まで、メモは500文字まで（前後の空白を除いて数える）', () => {
    expect(issuesOf(schema, { ...valid, destination: `\u3000${'あ'.repeat(50)}\u3000` })).toEqual(
      {},
    )
    expect(issuesOf(schema, { ...valid, destination: 'あ'.repeat(51) })).toHaveProperty(
      'destination',
    )
    expect(issuesOf(schema, { ...valid, memo: 'あ'.repeat(500) })).toEqual({})
    expect(issuesOf(schema, { ...valid, memo: 'あ'.repeat(501) })).toHaveProperty('memo')
  })
})

describe('予約を直す（tasks.md D-4・D-5）', () => {
  const schema = createReservationEditSchema(NOW)
  const common = { endsAt: valid.endsAt, destination: null, memo: null, version: 1 }

  it('車と開始日時を両方含めば、まだ始まっていない予約の直し方', () => {
    expect(schema.parse({ ...common, carId: CAR_ID, startsAt: valid.startsAt })).toEqual({
      kind: 'not_started',
      carId: CAR_ID,
      startsAt: new Date(valid.startsAt),
      endsAt: new Date(valid.endsAt),
      destination: null,
      memo: null,
      version: 1,
    })
  })

  it('両方含まなければ、使用中の予約の直し方。終了は今より前でもよい', () => {
    expect(schema.parse({ ...common, endsAt: '2026-10-07T10:40:00.000Z' })).toEqual({
      kind: 'in_use',
      endsAt: new Date('2026-10-07T10:40:00.000Z'),
      destination: null,
      memo: null,
      version: 1,
    })
  })

  it('片方だけなら形が違う', () => {
    expect(issuesOf(schema, { ...common, startsAt: valid.startsAt })).toEqual({
      _: CAR_MESSAGES.shapeMismatch,
    })
    expect(issuesOf(schema, { ...common, carId: CAR_ID })).toEqual({
      _: CAR_MESSAGES.shapeMismatch,
    })
  })

  it('行き先・メモ・版が欠けていたら止める（null と空の文字列は「無し」）', () => {
    const without = (key: keyof typeof common) =>
      Object.fromEntries(Object.entries(common).filter(([k]) => k !== key))
    expect(issuesOf(schema, without('destination'))).toHaveProperty('destination')
    expect(issuesOf(schema, without('memo'))).toHaveProperty('memo')
    expect(issuesOf(schema, without('version'))).toHaveProperty('version')
    expect(schema.parse({ ...common, destination: '　', memo: '' })).toMatchObject({
      destination: null,
      memo: null,
    })
  })

  it('まだ始まっていない予約の直し方は、終了が開始以前・今以前なら止める', () => {
    const notStarted = { ...common, carId: CAR_ID, startsAt: valid.startsAt }
    expect(issuesOf(schema, { ...notStarted, endsAt: valid.startsAt })).toEqual({
      endsAt: CAR_MESSAGES.endNotAfterStart,
    })
    expect(
      issuesOf(schema, {
        ...notStarted,
        startsAt: '2026-10-07T09:00:00.000Z',
        endsAt: '2026-10-07T10:00:00.000Z',
      }),
    ).toEqual({ endsAt: CAR_MESSAGES.endPassed })
  })
})

describe('一覧のクエリ', () => {
  it('view は既定で upcoming', () => {
    expect(reservationListQuerySchema.parse({})).toEqual({ view: 'upcoming' })
  })

  it('カーソルは「終了日時_ID」の形で、終了日時と ID に戻る', () => {
    const id = '00000000-0000-4000-8000-000000000003'
    const cursor = toHistoryCursor('2026-10-05T01:00:00Z', id)
    expect(cursor).toBe(`2026-10-05T01:00:00.000Z_${id}`)
    expect(reservationListQuerySchema.parse({ view: 'past', before: cursor })).toEqual({
      view: 'past',
      before: { endsAt: new Date('2026-10-05T01:00:00Z'), id },
    })
  })

  it('view=range は from・to（実在する日付）を受け付ける', () => {
    expect(
      reservationListQuerySchema.parse({ view: 'range', from: '2026-09-27', to: '2026-11-07' }),
    ).toEqual({ view: 'range', from: '2026-09-27', to: '2026-11-07' })
    expect(
      reservationListQuerySchema.parse({ view: 'range', from: '2026-10-10', to: '2026-10-10' }),
    ).toEqual({ view: 'range', from: '2026-10-10', to: '2026-10-10' })
  })

  it('view=range の日数は両端を含めて 42 日まで', () => {
    // 2026-09-27〜2026-11-07 は 42 日、2026-09-27〜2026-11-08 は 43 日
    expect(
      reservationListQuerySchema.safeParse({ view: 'range', from: '2026-09-27', to: '2026-11-07' })
        .success,
    ).toBe(true)
    expect(
      reservationListQuerySchema.safeParse({ view: 'range', from: '2026-09-27', to: '2026-11-08' })
        .success,
    ).toBe(false)
  })

  it('view=range で from・to が無い、形が違う、実在しない、from が to より後なら止める', () => {
    for (const q of [
      { view: 'range' },
      { view: 'range', from: '2026-10-10' },
      { view: 'range', to: '2026-10-10' },
      { view: 'range', from: '2026-10-1', to: '2026-10-10' },
      { view: 'range', from: '2026-02-30', to: '2026-03-01' },
      { view: 'range', from: '2026-10-11', to: '2026-10-10' },
    ]) {
      expect(reservationListQuerySchema.safeParse(q).success, JSON.stringify(q)).toBe(false)
    }
  })

  it('形の違うカーソルは止める', () => {
    expect(reservationListQuerySchema.safeParse({ view: 'past', before: 'abc' }).success).toBe(
      false,
    )
    expect(
      reservationListQuerySchema.safeParse({ view: 'past', before: '2026-13-45T99:00:00.000Z_x' })
        .success,
    ).toBe(false)
  })
})
