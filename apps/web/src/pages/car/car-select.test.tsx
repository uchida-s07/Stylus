import type { ReservationInput } from '@stylus/shared'
import { act, screen, waitFor, within } from '@testing-library/react'
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
  reservation,
  reservationList,
  selectRange,
  setDeviceClock,
} from '../../../test/car'
import { json } from '../../../test/fakeApi'
import { signIn } from '../../../test/money'
import { renderApp } from '../../../test/render'

type Handler = Parameters<typeof installCarApi>[0][string]

// 時間割から出る入力のテストは、車の画面の表示と入力の操作の両方を含むので長めに待つ
const LONG_TEST = 10_000

// 車の画面を開く。POST で作った予約は、その後の一覧に出る
function openCarPage(
  path: string,
  options: {
    cars?: ReturnType<typeof carList>
    list?: ReturnType<typeof reservation>[]
    failPost?: boolean
  } = {},
) {
  const { cars = carList(carItem('ノア')), list = [], failPost = false } = options
  const created: ReturnType<typeof reservation>[] = []
  const post: Handler = async (request) => {
    if (failPost) return carError(500, 'internal')()
    const body = (await request.clone().json()) as ReservationInput
    const car = cars.cars.find((c) => c.id === body.carId)!
    const r = {
      ...reservation({ car: car.name as 'ノア', from: '2026-10-10 00:00', to: '2026-10-10 01:00' }),
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      destination: body.destination || null,
    }
    created.push(r)
    return json(r, 201)
  }
  const fake = installCarApi({
    'GET /cars': () => json(cars),
    'GET /car-reservations': () => json(reservationList([...list, ...created])),
    'POST /car-reservations': post,
  })
  return { ...fake, ...renderApp(path) }
}

async function reservationDialog() {
  return screen.findByRole('dialog', { name: '予約する' })
}

const postsOf = (requests: Request[]) => requests.filter((r) => r.method === 'POST')

// 時間割に選んだ範囲が残っているか
const hasSelection = () => document.querySelector('.car-selection') !== null

// 10月10日の時間割で 9:00〜12:00 を選んで入力を出し、行き先「大学」を入れる
async function selectAndTypeDestination() {
  await bandsOn('10月10日(土)')
  await selectRange('2026-10-10 09:00', '2026-10-10 12:00')
  const dialog = await reservationDialog()
  await userEvent.type(within(dialog).getByLabelText('行き先'), '大学')
  return dialog
}

describe('時間割で範囲を選んで予約を入れる（CAR-F-004）', () => {
  beforeEach(() => {
    setDeviceClock('2026-10-07 20:00')
    signIn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it(
    '[CAR-F-004/AC-21] 「使う」の車が「ノア」だけのとき、10月10日の時間割で 9:00〜12:00 を選ぶと、車「ノア」・開始 2026-10-10 9:00・終了 2026-10-10 12:00 が入った入力が出る',
    async () => {
      openCarPage('/car?date=2026-10-10')
      await bandsOn('10月10日(土)')
      await selectRange('2026-10-10 09:00', '2026-10-10 12:00')

      const dialog = await reservationDialog()
      expect(within(dialog).getByLabelText('車')).toHaveValue(CAR_IDS.ノア)
      expect(within(dialog).getByLabelText('開始の日付')).toHaveValue('2026-10-10')
      expect(within(dialog).getByLabelText('開始の時刻')).toHaveValue('09:00')
      expect(within(dialog).getByLabelText('終了の日付')).toHaveValue('2026-10-10')
      expect(within(dialog).getByLabelText('終了の時刻')).toHaveValue('12:00')
    },
    LONG_TEST,
  )

  it(
    '[CAR-F-004/AC-22] 「使う」の車が「ノア」と「フィット」のとき、母の「フィット」の帯と重なる 9:00〜12:00 を選ぶと、開始・終了が入り、車は選ばれていない入力が出る',
    async () => {
      openCarPage('/car?date=2026-10-10', {
        cars: carList(carItem('ノア'), carItem('フィット', { colorIndex: 1 })),
        list: [
          reservation({
            car: 'フィット',
            who: 'mother',
            from: '2026-10-10 09:00',
            to: '2026-10-10 12:00',
          }),
        ],
      })
      expect(await bandsOn('10月10日(土)')).toHaveLength(1)
      await selectRange('2026-10-10 09:00', '2026-10-10 12:00')

      const dialog = await reservationDialog()
      expect(within(dialog).getByLabelText('車')).toHaveValue('')
      expect(within(dialog).getByLabelText('開始の日付')).toHaveValue('2026-10-10')
      expect(within(dialog).getByLabelText('開始の時刻')).toHaveValue('09:00')
      expect(within(dialog).getByLabelText('終了の日付')).toHaveValue('2026-10-10')
      expect(within(dialog).getByLabelText('終了の時刻')).toHaveValue('12:00')
    },
    LONG_TEST,
  )

  it(
    '[CAR-F-004/AC-24] 車が「使わない」の「ノア」だけのとき、範囲を選ぶと入力の欄は出ず「先に車を登録してください」と出て、車の管理の画面へ進める',
    async () => {
      openCarPage('/car?date=2026-10-10', { cars: carList(carItem('ノア', { isActive: false })) })
      await bandsOn('10月10日(土)')
      await selectRange('2026-10-10 09:00', '2026-10-10 12:00')

      expect(await screen.findByText('先に車を登録してください')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '車の管理へ' })).toHaveAttribute('href', '/car/cars')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('開始の日付')).not.toBeInTheDocument()
    },
    LONG_TEST,
  )

  it(
    '[CAR-F-004/AC-27] 時間割で 10月10日 9:00〜12:00 を選んで出た入力で「予約する」を押すと、入力が閉じ、10月10日の時間割に「ノア」「くうご」「9:00〜12:00」の帯が出る',
    async () => {
      const { requests } = openCarPage('/car?date=2026-10-10')
      await bandsOn('10月10日(土)')
      await selectRange('2026-10-10 09:00', '2026-10-10 12:00')
      const dialog = await reservationDialog()
      await userEvent.click(within(dialog).getByRole('button', { name: '予約する' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      // 読み直しが終わると帯が出る
      await waitFor(async () => expect(await bandsOn('10月10日(土)')).toHaveLength(1))
      const [band] = await bandsOn('10月10日(土)')
      expect(band).toHaveTextContent(/ノア.*くうご.*9:00〜12:00/)
      expect(await postsOf(requests)[0]!.clone().json()).toMatchObject({
        carId: CAR_IDS.ノア,
        startsAt: jstIso('2026-10-10 09:00'),
        endsAt: jstIso('2026-10-10 12:00'),
      })
    },
    LONG_TEST,
  )

  it(
    '[CAR-F-004/AC-23] 時間割で 9:00〜12:00 を選んで出た入力で「キャンセル」を押すと、入力が閉じ、予約は作られず、選んだ範囲が残らない',
    async () => {
      const { requests } = openCarPage('/car?date=2026-10-10')
      await bandsOn('10月10日(土)')
      await selectRange('2026-10-10 09:00', '2026-10-10 12:00')
      const dialog = await reservationDialog()
      expect(hasSelection()).toBe(true)
      await userEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(hasSelection()).toBe(false)
      expect(postsOf(requests)).toHaveLength(0)
    },
    LONG_TEST,
  )

  it(
    '[CAR-F-004/AC-25] 範囲から出た入力で行き先「大学」を入れ、予約の API が 500 を返す中で「予約する」を押すと、入力は閉じず「保存できませんでした。…」と出て、行き先「大学」が残っている',
    async () => {
      const { router } = openCarPage('/car?date=2026-10-10', { failPost: true })
      const dialog = await selectAndTypeDestination()
      await userEvent.click(within(dialog).getByRole('button', { name: '予約する' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        '保存できませんでした。時間をおいてもう一度お試しください。',
      )
      // 閉じる処理（履歴を戻す）は後から動くので、少し待ってから入力が残っていることを確かめる
      await act(() => new Promise((resolve) => setTimeout(resolve, 200)))
      expect(router.state.location.state).toHaveProperty('reservationDialog')
      const stillOpen = screen.getByRole('dialog', { name: '予約する' })
      expect(within(stillOpen).getByLabelText('行き先')).toHaveValue('大学')
    },
    LONG_TEST,
  )

  it(
    '[CAR-F-004/AC-28] 範囲から出た入力で行き先「大学」を入れ、入力の外側を押しても、入力は閉じず、行き先「大学」が残っている',
    async () => {
      const { router } = openCarPage('/car?date=2026-10-10')
      await selectAndTypeDestination()
      const overlay = document.querySelector<HTMLElement>('.mantine-Drawer-overlay')!
      await userEvent.click(overlay)

      // 閉じる処理（履歴を戻す）は後から動くので、少し待ってから入力が残っていることを確かめる
      await act(() => new Promise((resolve) => setTimeout(resolve, 200)))
      expect(router.state.location.state).toHaveProperty('reservationDialog')
      const dialog = screen.getByRole('dialog', { name: '予約する' })
      expect(within(dialog).getByLabelText('行き先')).toHaveValue('大学')
    },
    LONG_TEST,
  )

  it(
    '[CAR-F-004/AC-29] 範囲から出た入力で行き先「大学」を入れ、端末の「戻る」操作をすると、入力が閉じ、予約は作られず、車の画面の10月10日の時間割が出ている',
    async () => {
      const { requests, router } = openCarPage('/car?date=2026-10-10')
      await selectAndTypeDestination()
      await act(() => router.navigate(-1))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(await bandsOn('10月10日(土)')).toEqual([])
      expect(router.state.location.pathname).toBe('/car')
      expect(router.state.location.search).toBe('?date=2026-10-10')
      expect(hasSelection()).toBe(false)
      expect(postsOf(requests)).toHaveLength(0)
    },
    LONG_TEST,
  )

  // AC ではない確認
  it(
    '✕と Esc は「キャンセル」と同じく、入力を閉じて選んだ範囲を消す。保存の後とキャンセルの後は、積んだ履歴を戻す',
    async () => {
      const { router } = openCarPage('/car?date=2026-10-10')
      await bandsOn('10月10日(土)')
      await selectRange('2026-10-10 09:00', '2026-10-10 12:00')
      const dialog = await reservationDialog()
      await userEvent.click(within(dialog).getByRole('button', { name: '閉じる' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(hasSelection()).toBe(false)

      await selectRange('2026-10-10 13:00', '2026-10-10 14:00')
      await reservationDialog()
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(hasSelection()).toBe(false)
      // 入力を開いたときに積んだ履歴（入力の印を持つ）は戻してある
      expect(router.state.location.search).toBe('?date=2026-10-10')
      expect(router.state.location.state).toBeNull()
    },
    LONG_TEST,
  )

  it(
    '入力を開き直すと requestId が変わる',
    async () => {
      const { requests } = openCarPage('/car?date=2026-10-10', { failPost: true })
      await bandsOn('10月10日(土)')
      for (const [from, to] of [
        ['09:00', '10:00'],
        ['13:00', '14:00'],
      ]) {
        await selectRange(`2026-10-10 ${from}`, `2026-10-10 ${to}`)
        const dialog = await reservationDialog()
        await userEvent.click(within(dialog).getByRole('button', { name: '予約する' }))
        await within(dialog).findByRole('alert')
        await userEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      }
      const ids = await Promise.all(
        postsOf(requests).map(
          async (r) => ((await r.clone().json()) as ReservationInput).requestId,
        ),
      )
      expect(ids).toHaveLength(2)
      expect(ids[0]).not.toBe(ids[1])
    },
    LONG_TEST,
  )

  it(
    '入力で開始・終了の日付を10月12日に直して保存すると、10月12日へ移る',
    async () => {
      const { router } = openCarPage('/car?date=2026-10-10')
      await bandsOn('10月10日(土)')
      await selectRange('2026-10-10 09:00', '2026-10-10 12:00')
      await reservationDialog()
      await fillDateTime('開始', '2026-10-12', '09:00')
      await fillDateTime('終了', '2026-10-12', '12:00')
      await userEvent.click(
        within(await reservationDialog()).getByRole('button', { name: '予約する' }),
      )

      expect(await bandsOn('10月12日(月)')).toHaveLength(1)
      expect(router.state.location.search).toBe('?date=2026-10-12')
    },
    LONG_TEST,
  )
})
