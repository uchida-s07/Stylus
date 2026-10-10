import type { ReservationInput } from '@stylus/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CAR_IDS,
  carItem,
  carList,
  installCarApi,
  jstIso,
  reservation,
  reservationList,
  setDeviceClock,
} from '../../../test/car'
import { json } from '../../../test/fakeApi'
import type { FamilyKey } from '../../../test/money'
import { signIn } from '../../../test/money'
import { renderApp } from '../../../test/render'

type Handler = Parameters<typeof installCarApi>[0][string]

// 予約の入力を開く（車の一覧と POST の応答を差し替えられる）
export function openNewReservation(
  options: {
    cars?: ReturnType<typeof carList>
    post?: Handler
    who?: FamilyKey
    extra?: Record<string, Handler>
  } = {},
) {
  const {
    cars = carList(carItem('BMW'), carItem('ノア')),
    post = () => json(reservation({ from: '2026-10-10 09:00', to: '2026-10-10 12:00' }), 201),
    who = 'kugo',
    extra = {},
  } = options
  const fake = installCarApi(
    {
      'GET /cars': () => json(cars),
      'POST /car-reservations': post,
      'GET /car-reservations': () => json(reservationList([])),
      ...extra,
    },
    who,
  )
  return { ...fake, ...renderApp('/car/reservations/new') }
}

// 日付と時刻の欄に入れる（日付は YYYY-MM-DD、時刻は HH:MM）
export async function fillDateTime(which: '開始' | '終了', date: string, time: string) {
  const dateInput = screen.getByLabelText(`${which}の日付`)
  const timeInput = screen.getByLabelText(`${which}の時刻`)
  await userEvent.clear(dateInput)
  if (date) await userEvent.type(dateInput, date)
  await userEvent.clear(timeInput)
  if (time) await userEvent.type(timeInput, time)
}

// 車「ノア」・10月10日 9:00〜12:00 を入れる
export async function fillNoahPeriod() {
  await userEvent.selectOptions(await screen.findByLabelText('車'), 'ノア')
  await fillDateTime('開始', '2026-10-10', '09:00')
  await fillDateTime('終了', '2026-10-10', '12:00')
}

export const submitReservation = () =>
  userEvent.click(screen.getByRole('button', { name: '予約する' }))
export const postsOf = (requests: Request[]) => requests.filter((r) => r.method === 'POST')

async function carOptions() {
  const select = await screen.findByLabelText('車')
  return within(select)
    .getAllByRole('option')
    .map((o) => o.textContent)
    .filter((label) => label !== '選んでください')
}

describe('予約の入力の画面（CAR-F-004）', () => {
  beforeEach(() => {
    setDeviceClock('2026-10-07 20:00')
    signIn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('[CAR-F-004/AC-1] くうごが「ノア」・10月10日 9:00〜12:00・行き先「大学」で予約すると、予約が送られ、車の画面の「10月10日(土)」の下に出る', async () => {
    const created = reservation({
      from: '2026-10-10 09:00',
      to: '2026-10-10 12:00',
      destination: '大学',
    })
    const { requests, router } = openNewReservation({
      post: () => json(created, 201),
      extra: { 'GET /car-reservations': () => json(reservationList([created])) },
    })
    await fillNoahPeriod()
    await userEvent.type(screen.getByLabelText('行き先'), '大学')
    await submitReservation()

    const oct10 = await screen.findByRole('region', { name: '10月10日(土)' })
    expect(within(oct10).getByRole('link')).toHaveTextContent(/ノア.*くうご.*9:00〜12:00.*大学/)
    expect(router.state.location.pathname).toBe('/car')
    const [post] = postsOf(requests)
    expect(await post!.clone().json()).toMatchObject({
      carId: CAR_IDS.ノア,
      startsAt: jstIso('2026-10-10 09:00'),
      endsAt: jstIso('2026-10-10 12:00'),
      destination: '大学',
    } satisfies Partial<ReservationInput>)
  })

  it('[CAR-F-004/AC-7] 終了日時を空にして「予約する」を押すと、予約は送られず、終了日時に「入力してください」と出る', async () => {
    const { requests } = openNewReservation()
    await fillNoahPeriod()
    await fillDateTime('終了', '', '')
    await submitReservation()

    expect(screen.getByLabelText('終了の日付')).toHaveAccessibleDescription('入力してください')
    expect(postsOf(requests)).toHaveLength(0)
  })

  it('[CAR-F-004/AC-8] 10月10日 12:00〜12:00 と 12:00〜11:00 は、どちらも送られず「終了は開始より後にしてください」と出る', async () => {
    const { requests } = openNewReservation()
    await userEvent.selectOptions(await screen.findByLabelText('車'), 'ノア')
    for (const end of ['12:00', '11:00']) {
      await fillDateTime('開始', '2026-10-10', '12:00')
      await fillDateTime('終了', '2026-10-10', end)
      await submitReservation()
      expect(screen.getByLabelText('終了の時刻')).toHaveAccessibleDescription(
        '終了は開始より後にしてください',
      )
    }
    expect(postsOf(requests)).toHaveLength(0)
  })

  it.each([
    ['車が1台も無い', carList()],
    ['「使わない」の車だけがある（D-6）', carList(carItem('ノア', { isActive: false }))],
  ])(
    '[CAR-F-004/AC-13] 「使う」の車が1台も無い（%s）と「先に車を登録してください」と出て、車の管理の画面へ進める',
    async (_label, cars) => {
      openNewReservation({ cars })

      expect(await screen.findByText('先に車を登録してください')).toBeInTheDocument()
      expect(screen.queryByLabelText('車')).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: '車の管理へ' })).toHaveAttribute('href', '/car/cars')
    },
  )

  // AC ではない確認
  it('開始を選ぶと、終了が空なら開始の1時間後が入る（入った後は直せる）', async () => {
    openNewReservation()
    await userEvent.type(await screen.findByLabelText('開始の日付'), '2026-10-10')
    await userEvent.type(screen.getByLabelText('開始の時刻'), '23:30')

    expect(screen.getByLabelText('終了の日付')).toHaveValue('2026-10-11')
    expect(screen.getByLabelText('終了の時刻')).toHaveValue('00:30')
    await fillDateTime('終了', '2026-10-11', '02:00')
    expect(screen.getByLabelText('終了の時刻')).toHaveValue('02:00')
  })
})

describe('予約の入力の車の選択肢（CAR-F-001・002）', () => {
  beforeEach(() => {
    setDeviceClock('2026-10-07 20:00')
    signIn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('[CAR-F-001/AC-1] 車「ノア」が登録されていると、母の予約の入力の車の選択肢に「ノア」が出る', async () => {
    openNewReservation({ who: 'mother' })
    expect(await carOptions()).toEqual(['BMW', 'ノア'])
  })

  it('[CAR-F-001/AC-6] 車が「BMW」だけなら、選択肢は「BMW」だけで、最初から選ばれている', async () => {
    openNewReservation({ cars: carList(carItem('BMW')) })
    expect(await carOptions()).toEqual(['BMW'])
    expect(screen.getByLabelText('車')).toHaveValue(CAR_IDS.BMW)
  })

  it('[CAR-F-002/AC-1] 「使わない」の車「ノア」は、予約の入力の車の選択肢に出ない', async () => {
    openNewReservation({ cars: carList(carItem('BMW'), carItem('ノア', { isActive: false })) })
    expect(await carOptions()).toEqual(['BMW'])
  })

  it('[CAR-F-002/AC-2] 「使う」に戻した「ノア」は、予約の入力の車の選択肢に出る', async () => {
    openNewReservation({ cars: carList(carItem('BMW'), carItem('ノア', { isActive: true })) })
    expect(await carOptions()).toEqual(['BMW', 'ノア'])
  })
})
