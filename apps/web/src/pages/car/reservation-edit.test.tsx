import type { Reservation, ReservationDetail } from '@stylus/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bandsOn,
  CAR_IDS,
  carError,
  carItem,
  carList,
  fillDateTime,
  installCarApi,
  jstIso,
  reservationDetail,
  reservationList,
  setDeviceClock,
} from '../../../test/car'
import { json } from '../../../test/fakeApi'
import { signIn } from '../../../test/money'
import { renderApp } from '../../../test/render'

type Handler = Parameters<typeof installCarApi>[0][string]

// 入力の操作と、車の画面（遅延読み込み）の表示の両方を含むテストは長めに待つ
const LONG_TEST = 10_000

// くうごの「ノア」10月10日 9:00〜12:00（版 1）
const kugoReservation = (overrides: Partial<Parameters<typeof reservationDetail>[0]> = {}) =>
  reservationDetail({
    id: '50000000-0000-4000-8000-000000000100',
    who: 'kugo',
    from: '2026-10-10 09:00',
    to: '2026-10-10 12:00',
    isMine: true,
    ...overrides,
  })

// 予約を直す画面を開く。GET は呼ばれるたびに details を順に返す（最後のものを繰り返す）
function openEdit(
  details: ReservationDetail[],
  options: { patch?: Handler; cars?: ReturnType<typeof carList>; list?: Reservation[] } = {},
) {
  let calls = 0
  const {
    patch = () => json(details.at(-1)),
    cars = carList(carItem('BMW'), carItem('ノア'), carItem('フィット')),
    list = [],
  } = options
  const fake = installCarApi({
    'GET /car-reservations/:id': () => {
      const d = details[Math.min(calls, details.length - 1)]!
      calls += 1
      return json(d)
    },
    'PATCH /car-reservations/:id': patch,
    'GET /cars': () => json(cars),
    'GET /car-reservations': () => json(reservationList(list)),
  })
  return { ...fake, ...renderApp(`/car/reservations/${details[0]!.id}/edit`) }
}

const save = () => userEvent.click(screen.getByRole('button', { name: '保存する' }))
const patchesOf = (requests: Request[]) => requests.filter((r) => r.method === 'PATCH')

describe('予約を直す画面（CAR-F-006）', () => {
  beforeEach(() => {
    setDeviceClock('2026-10-07 20:00')
    signIn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('[CAR-F-006/AC-4] せいごの予約と重なると、保存されず「その時間はせいごの予約（10月10日(土) 13:00〜14:00）と重なっています」と出る', async () => {
    const { router } = openEdit([kugoReservation()], {
      patch: carError(409, 'overlap', 'x', {
        conflict: {
          displayName: 'せいご',
          startsAt: jstIso('2026-10-10 13:00'),
          endsAt: jstIso('2026-10-10 14:00'),
        },
      }),
    })
    await screen.findByLabelText('終了の時刻')
    await fillDateTime('終了', '2026-10-10', '13:30')
    await save()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'その時間はせいごの予約（10月10日(土) 13:00〜14:00）と重なっています',
    )
    expect(router.state.location.pathname).toMatch(/\/edit$/)
  })

  it('[CAR-F-006/AC-7] 10月10日 10:00、使用中の予約は車と開始日時を出さず、終了を 9:40 に直して保存すると、車・開始を送らずに保存され、10月10日の時間割に 9:00〜9:40 の帯が「使用中」なしで出る', async () => {
    setDeviceClock('2026-10-10 10:00')
    const r = kugoReservation()
    const saved = kugoReservation({ to: '2026-10-10 09:40', version: 2 })
    const { requests, router } = openEdit([r], {
      patch: () => json(saved),
      list: [saved],
    })
    await screen.findByLabelText('終了の時刻')
    expect(screen.queryByLabelText('車')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('開始の日付')).not.toBeInTheDocument()
    await fillDateTime('終了', '2026-10-10', '09:40')
    await save()

    await waitFor(() => expect(router.state.location.pathname).toBe('/car'))
    const body = await patchesOf(requests)[0]!.clone().json()
    // 行き先・メモの「無し」は空の文字列で送る（tasks.md D-4）
    expect(body).toEqual({
      endsAt: jstIso('2026-10-10 09:40'),
      destination: '',
      memo: '',
      version: 1,
    })
    const [band, ...rest] = await bandsOn('10月10日(土)')
    expect(rest).toEqual([])
    expect(band).toHaveTextContent('9:00〜9:40')
    expect(band).not.toHaveTextContent('使用中')
  })

  it('[CAR-F-006/AC-8] 10月10日 10:00、使用中の予約の終了を 14:00 に直して保存すると、10月10日の時間割に 9:00〜14:00 の帯が「使用中」付きで出る', async () => {
    setDeviceClock('2026-10-10 10:00')
    const saved = kugoReservation({ to: '2026-10-10 14:00', version: 2 })
    const { requests, router } = openEdit([kugoReservation()], {
      patch: () => json(saved),
      list: [saved],
    })
    await screen.findByLabelText('終了の時刻')
    await fillDateTime('終了', '2026-10-10', '14:00')
    await save()

    await waitFor(() => expect(router.state.location.pathname).toBe('/car'))
    expect(await patchesOf(requests)[0]!.clone().json()).toMatchObject({
      endsAt: jstIso('2026-10-10 14:00'),
    })
    const [band, ...rest] = await bandsOn('10月10日(土)')
    expect(rest).toEqual([])
    expect(band).toHaveTextContent('9:00〜14:00')
    expect(band).toHaveTextContent('使用中')
  })

  it('[CAR-F-006/AC-11] 端末 B で直していたら、保存されず「予約の中身が変わりました。もう一度確かめてください。」と出て、端末 B の中身が出る', async () => {
    const latest = kugoReservation({ to: '2026-10-10 13:00', version: 2 })
    openEdit([kugoReservation(), latest], {
      patch: carError(409, 'state_changed', '予約の中身が変わりました。もう一度確かめてください。'),
    })
    await screen.findByLabelText('行き先')
    await userEvent.type(screen.getByLabelText('行き先'), '駅')
    await save()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '予約の中身が変わりました。もう一度確かめてください。',
    )
    await waitFor(() => expect(screen.getByLabelText('終了の時刻')).toHaveValue('13:00'))
  })

  it('[CAR-F-006/AC-12] 端末 B で取り消していたら、保存すると「この予約は見つかりません。」と出る', async () => {
    openEdit([kugoReservation()], {
      patch: carError(404, 'not_found', 'この予約は見つかりません。'),
    })
    await screen.findByLabelText('終了の時刻')
    await fillDateTime('終了', '2026-10-10', '13:00')
    await save()

    expect(await screen.findByText('この予約は見つかりません。')).toBeInTheDocument()
  })

  it('[CAR-F-006/AC-13] 8:55 に開き終了を 13:00 にして、9:00 を過ぎてから保存すると「この予約はもう始まっています。もう一度開いてください。」と出る', async () => {
    setDeviceClock('2026-10-10 08:55')
    const r = kugoReservation()
    openEdit([r, r], {
      patch: carError(
        409,
        'state_changed',
        'この予約はもう始まっています。もう一度開いてください。',
      ),
    })
    await screen.findByLabelText('終了の時刻')
    await fillDateTime('終了', '2026-10-10', '13:00')
    setDeviceClock('2026-10-10 09:01')
    await save()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'この予約はもう始まっています。もう一度開いてください。',
    )
  })

  it('[CAR-F-006/AC-14] 開始 10月7日 18:00・終了 19:00 に直すと、保存されず「終了の日時が過ぎています」と出る', async () => {
    const { requests } = openEdit([kugoReservation()])
    await screen.findByLabelText('開始の日付')
    await fillDateTime('開始', '2026-10-07', '18:00')
    await fillDateTime('終了', '2026-10-07', '19:00')
    await save()

    expect(screen.getByLabelText('終了の時刻')).toHaveAccessibleDescription(
      '終了の日時が過ぎています',
    )
    expect(patchesOf(requests)).toHaveLength(0)
  })

  it('[CAR-F-006/AC-15] 車を「フィット」に変えている間に「フィット」が「使わない」になったら「この車は今は予約できません。選び直してください」と出る', async () => {
    openEdit([kugoReservation()], { patch: carError(409, 'car_unavailable') })
    await userEvent.selectOptions(await screen.findByLabelText('車'), 'フィット')
    await save()

    await waitFor(() =>
      expect(screen.getByLabelText('車')).toHaveAccessibleDescription(
        'この車は今は予約できません。選び直してください',
      ),
    )
  })

  it('[CAR-F-006/AC-16] 11:55 に使用中の予約の行き先を変え、12:00 を過ぎてから保存すると「この予約はもう終わっているため直せません。」と出る', async () => {
    setDeviceClock('2026-10-10 11:55')
    const r = kugoReservation()
    openEdit([r, r], {
      patch: carError(409, 'state_changed', 'この予約はもう終わっているため直せません。'),
    })
    await userEvent.type(await screen.findByLabelText('行き先'), '駅')
    setDeviceClock('2026-10-10 12:01')
    await save()

    expect(
      await screen.findByText('この予約はもう終わっているため直せません。'),
    ).toBeInTheDocument()
  })

  it('[CAR-F-006/AC-17] まだ始まっていない予約の終了日時を空にして保存すると、保存されず終了日時に「入力してください」と出る', async () => {
    const { requests } = openEdit([kugoReservation()])
    await screen.findByLabelText('終了の日付')
    await fillDateTime('終了', '', '')
    await save()

    expect(screen.getByLabelText('終了の日付')).toHaveAccessibleDescription('入力してください')
    expect(patchesOf(requests)).toHaveLength(0)
  })

  it('[CAR-F-006/AC-18] 終了を 10月10日 9:00 に直すと、保存されず「終了は開始より後にしてください」と出る', async () => {
    const { requests } = openEdit([kugoReservation()])
    await screen.findByLabelText('終了の時刻')
    await fillDateTime('終了', '2026-10-10', '09:00')
    await save()

    expect(screen.getByLabelText('終了の時刻')).toHaveAccessibleDescription(
      '終了は開始より後にしてください',
    )
    expect(patchesOf(requests)).toHaveLength(0)
  })

  it('[CAR-F-006/AC-20] 車を「フィット」に変えている間に「フィット」が削除されたら「この車は見つかりません。」と出る', async () => {
    openEdit([kugoReservation()], {
      patch: carError(400, 'invalid_input', 'x', { fields: { carId: 'この車は見つかりません。' } }),
    })
    await userEvent.selectOptions(await screen.findByLabelText('車'), 'フィット')
    await save()

    await waitFor(() =>
      expect(screen.getByLabelText('車')).toHaveAccessibleDescription('この車は見つかりません。'),
    )
  })

  it(
    '[CAR-F-006/AC-21] 「使わない」の「ノア」の予約は、車の選択肢に「ノア」が出て選ばれたまま、終了を 13:00 に直して保存でき、10月10日の時間割に 9:00〜13:00 の帯が出る',
    async () => {
      const r = kugoReservation({ carActive: false })
      const saved = kugoReservation({ carActive: false, to: '2026-10-10 13:00', version: 2 })
      const { requests, router } = openEdit([r], {
        cars: carList(carItem('BMW'), carItem('ノア', { isActive: false })),
        patch: () => json(saved),
        list: [saved],
      })
      const select = await screen.findByLabelText('車')
      expect(select).toHaveValue(CAR_IDS.ノア)
      expect(
        within(select)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['選んでください', 'BMW', 'ノア（使わない）'])
      await fillDateTime('終了', '2026-10-10', '13:00')
      await save()

      const [band, ...rest] = await bandsOn('10月10日(土)')
      expect(rest).toEqual([])
      expect(band).toHaveTextContent('9:00〜13:00')
      expect(router.state.location.search).toBe('?date=2026-10-10')
      expect(await patchesOf(requests)[0]!.clone().json()).toMatchObject({
        carId: CAR_IDS.ノア,
        startsAt: jstIso('2026-10-10 09:00'),
        endsAt: jstIso('2026-10-10 13:00'),
        version: 1,
      })
    },
    LONG_TEST,
  )

  it(
    '[CAR-F-005/AC-14] くうごが開始を 10月12日 9:00・終了を 10月12日 12:00 に直して保存すると、10月12日の時間割の画面に戻り、9:00〜12:00 の帯が出る',
    async () => {
      const saved = kugoReservation({
        from: '2026-10-12 09:00',
        to: '2026-10-12 12:00',
        version: 2,
      })
      const { router } = openEdit([kugoReservation()], { patch: () => json(saved), list: [saved] })
      await screen.findByLabelText('開始の日付')
      await fillDateTime('開始', '2026-10-12', '09:00')
      await fillDateTime('終了', '2026-10-12', '12:00')
      await save()

      const [band, ...rest] = await bandsOn('10月12日(月)')
      expect(rest).toEqual([])
      expect(band).toHaveTextContent('9:00〜12:00')
      expect(router.state.location.pathname).toBe('/car')
      expect(router.state.location.search).toBe('?date=2026-10-12')
    },
    LONG_TEST,
  )
})
