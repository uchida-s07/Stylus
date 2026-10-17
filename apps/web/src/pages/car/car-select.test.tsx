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
  dayView,
  dragFrameBy,
  dragFrameEdge,
  fillDateTime,
  installCarApi,
  jstIso,
  makeFrame,
  reservation,
  reservationList,
  setDeviceClock,
  tapFrame,
  tapTimeGrid,
  timeFrame,
  yOf,
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

// 10月10日の時間割に 9:00〜12:00 の枠を出し、枠をタップして入力を出す
async function openInputFromFrame() {
  await bandsOn('10月10日(土)')
  await makeFrame('09:00', '12:00')
  tapFrame()
  return reservationDialog()
}

// 枠（9:00〜12:00）から入力を出し、行き先「大学」を入れる
async function openInputAndTypeDestination() {
  const dialog = await openInputFromFrame()
  await userEvent.type(within(dialog).getByLabelText('行き先'), '大学')
  return dialog
}

describe('時間割の枠から予約を入れる（CAR-F-004）', () => {
  beforeEach(() => {
    setDeviceClock('2026-10-07 20:00')
    signIn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it(
    '[CAR-F-004/AC-21] 「使う」の車が「ノア」だけのとき、10月10日の時間割の 9:00〜12:00 の枠をタップすると、車「ノア」・開始 2026-10-10 9:00・終了 2026-10-10 12:00 が入った入力が出る',
    async () => {
      openCarPage('/car?date=2026-10-10')
      const dialog = await openInputFromFrame()

      expect(within(dialog).getByLabelText('車')).toHaveValue(CAR_IDS.ノア)
      expect(within(dialog).getByLabelText('開始の日付')).toHaveValue('2026-10-10')
      expect(within(dialog).getByLabelText('開始の時刻')).toHaveValue('09:00')
      expect(within(dialog).getByLabelText('終了の日付')).toHaveValue('2026-10-10')
      expect(within(dialog).getByLabelText('終了の時刻')).toHaveValue('12:00')
    },
    LONG_TEST,
  )

  it(
    '[CAR-F-004/AC-22] 「使う」の車が「ノア」と「フィット」のとき、母の「フィット」の帯の脇をタップして出し、帯と重なる 9:00〜12:00 に動かした枠をタップすると、開始・終了が入り、車は選ばれていない入力が出る',
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
      // 帯の脇の余白（時間割の面）の 9:00 をタップし、下の端を 12:00 まで引いて帯と重ねる
      await tapTimeGrid('09:00')
      dragFrameEdge('end', '12:00')
      expect(timeFrame()).toBe('09:00〜12:00')
      tapFrame()

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
    '[CAR-F-004/AC-24] 車が「使わない」の「ノア」だけのとき、時間割の空いた所をタップすると、枠も入力の欄も出ず「先に車を登録してください」と出て、車の管理の画面へ進める',
    async () => {
      openCarPage('/car?date=2026-10-10', { cars: carList(carItem('ノア', { isActive: false })) })
      await bandsOn('10月10日(土)')
      await tapTimeGrid('09:00')

      expect(await screen.findByText('先に車を登録してください')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '車の管理へ' })).toHaveAttribute('href', '/car/cars')
      expect(timeFrame()).toBeNull()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('開始の日付')).not.toBeInTheDocument()
    },
    LONG_TEST,
  )

  it(
    '[CAR-F-004/AC-27] 10月10日 9:00〜12:00 の枠から出た入力で「予約する」を押すと、入力が閉じ、10月10日の時間割に「ノア」「くうご」「9:00〜12:00」の帯が出る',
    async () => {
      const { requests } = openCarPage('/car?date=2026-10-10')
      const dialog = await openInputFromFrame()
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
    '[CAR-F-004/AC-23] 10月10日の時間割の枠（9:00〜12:00）から出た入力で「キャンセル」を押すと、入力が閉じ、予約は作られず、時間割に枠が残らない',
    async () => {
      const { requests } = openCarPage('/car?date=2026-10-10')
      const dialog = await openInputFromFrame()
      expect(timeFrame()).toBe('09:00〜12:00')
      await userEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(timeFrame()).toBeNull()
      expect(postsOf(requests)).toHaveLength(0)
    },
    LONG_TEST,
  )

  it(
    '[CAR-F-004/AC-25] 枠から出た入力で行き先「大学」を入れ、予約の API が 500 を返す中で「予約する」を押すと、入力は閉じず「保存できませんでした。…」と出て、行き先「大学」が残っている',
    async () => {
      const { router } = openCarPage('/car?date=2026-10-10', { failPost: true })
      const dialog = await openInputAndTypeDestination()
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
    '[CAR-F-004/AC-28] 枠から出た入力で行き先「大学」を入れ、入力の外側を押しても、入力は閉じず、行き先「大学」が残っている',
    async () => {
      const { router } = openCarPage('/car?date=2026-10-10')
      await openInputAndTypeDestination()
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
    '[CAR-F-004/AC-29] 枠から出た入力で行き先「大学」を入れ、端末の「戻る」操作をすると、入力が閉じ、予約は作られず、10月10日の時間割が出ている',
    async () => {
      const { requests, router } = openCarPage('/car?date=2026-10-10')
      await openInputAndTypeDestination()
      await act(() => router.navigate(-1))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(await bandsOn('10月10日(土)')).toEqual([])
      expect(router.state.location.pathname).toBe('/car')
      expect(router.state.location.search).toBe('?date=2026-10-10')
      expect(timeFrame()).toBeNull()
      expect(postsOf(requests)).toHaveLength(0)
    },
    LONG_TEST,
  )

  it('[CAR-F-004/AC-30] 10月10日の時間割の 9:07 の空いた所をタップすると、9:00〜10:00 の枠が出る', async () => {
    openCarPage('/car?date=2026-10-10')
    await bandsOn('10月10日(土)')
    await tapTimeGrid('09:07')

    expect(timeFrame()).toBe('09:00〜10:00')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('[CAR-F-004/AC-31] 9:00〜10:00 の枠の上の端を 8:30 の所まで引くと、枠は 8:30〜10:00 になる', async () => {
    openCarPage('/car?date=2026-10-10')
    await bandsOn('10月10日(土)')
    await tapTimeGrid('09:00')
    dragFrameEdge('start', '08:30')

    expect(timeFrame()).toBe('08:30〜10:00')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('[CAR-F-004/AC-32] 9:00〜10:00 の枠が出ているときに、枠の外の空いた所（14:00）をタップすると、枠が消え、入力は出ない', async () => {
    openCarPage('/car?date=2026-10-10')
    await bandsOn('10月10日(土)')
    await tapTimeGrid('09:00')
    expect(timeFrame()).toBe('09:00〜10:00')
    await tapTimeGrid('14:00')

    expect(timeFrame()).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('[CAR-F-004/AC-33] 9:00〜10:00 の枠の下の端を 11:20 の所まで引くと、枠は 9:00〜11:15 になる', async () => {
    openCarPage('/car?date=2026-10-10')
    await bandsOn('10月10日(土)')
    await tapTimeGrid('09:00')
    dragFrameEdge('end', '11:20')

    expect(timeFrame()).toBe('09:00〜11:15')
  })

  it('[CAR-F-004/AC-34] 9:00〜10:00 の枠の中を引いて35分下へ動かすと、枠は長さを保って 9:30〜10:30 になる', async () => {
    openCarPage('/car?date=2026-10-10')
    await bandsOn('10月10日(土)')
    await tapTimeGrid('09:00')
    dragFrameBy(35)

    expect(timeFrame()).toBe('09:30〜10:30')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('[CAR-F-004/AC-35] 10月10日の時間割の 23:30 の空いた所をタップすると、23:30〜24:00 の枠が出る', async () => {
    openCarPage('/car?date=2026-10-10')
    await bandsOn('10月10日(土)')
    await tapTimeGrid('23:30')

    expect(timeFrame()).toBe('23:30〜24:00')
  })

  it('[CAR-F-004/AC-37] 9:00〜10:00 の枠の下の端を 8:00 の所まで引くと、枠は 9:00〜9:15 で止まる', async () => {
    openCarPage('/car?date=2026-10-10')
    await bandsOn('10月10日(土)')
    await tapTimeGrid('09:00')
    dragFrameEdge('end', '08:00')

    expect(timeFrame()).toBe('09:00〜09:15')
  })

  it('[CAR-F-004/AC-38] 22:00〜23:00 の枠の中を引いて2時間下へ動かすと、枠は長さを保って 23:00〜24:00 で止まる', async () => {
    openCarPage('/car?date=2026-10-10')
    await bandsOn('10月10日(土)')
    await tapTimeGrid('22:00')
    dragFrameBy(120)

    expect(timeFrame()).toBe('23:00〜24:00')
  })

  // AC ではない確認
  it(
    '✕と Esc は「キャンセル」と同じく、入力を閉じて枠を消す。保存の後とキャンセルの後は、積んだ履歴を戻す',
    async () => {
      const { router } = openCarPage('/car?date=2026-10-10')
      const dialog = await openInputFromFrame()
      await userEvent.click(within(dialog).getByRole('button', { name: '閉じる' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(timeFrame()).toBeNull()

      await makeFrame('13:00', '14:00')
      tapFrame()
      await reservationDialog()
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(timeFrame()).toBeNull()
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
      ] as const) {
        await makeFrame(from, to)
        tapFrame()
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
      await openInputFromFrame()
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

  it(
    '終了 24:00 の枠（23:30〜24:00）から出た入力の終了は、翌日の 0:00',
    async () => {
      openCarPage('/car?date=2026-10-10')
      await bandsOn('10月10日(土)')
      await tapTimeGrid('23:30')
      tapFrame()

      const dialog = await reservationDialog()
      expect(within(dialog).getByLabelText('開始の日付')).toHaveValue('2026-10-10')
      expect(within(dialog).getByLabelText('開始の時刻')).toHaveValue('23:30')
      expect(within(dialog).getByLabelText('終了の日付')).toHaveValue('2026-10-11')
      expect(within(dialog).getByLabelText('終了の時刻')).toHaveValue('00:00')
    },
    LONG_TEST,
  )

  it('帯を押すと予約の中身へ進み、枠は出ない', async () => {
    const r = reservation({ from: '2026-10-10 09:00', to: '2026-10-10 12:00' })
    const { router } = openCarPage('/car?date=2026-10-10', { list: [r] })
    const [band] = await bandsOn('10月10日(土)')
    await userEvent.click(band!)

    await waitFor(() => expect(router.state.location.pathname).toBe(`/car/reservations/${r.id}`))
    expect(timeFrame()).toBeNull()
  })

  it('今日の時間割にだけ今の時刻の線が出る。最初の表示位置は、今日なら今の時刻の1時間前、ほかの日は 8:00', async () => {
    openCarPage('/car?date=2026-10-07')
    const today = await dayView('10月7日(水)')
    const nowLine = today.querySelector<HTMLElement>('[data-now-line]')
    expect(nowLine).not.toBeNull()
    expect(nowLine!.style.top).toBe(`${yOf('20:00')}px`)
    // 今は 20:00 なので 19:00 から
    expect(today.querySelector<HTMLElement>('.car-grid-scroll')!.scrollTop).toBe(yOf('19:00'))

    await userEvent.click(screen.getByRole('button', { name: '次の日' }))
    const tomorrow = await dayView('10月8日(木)')
    expect(tomorrow.querySelector('[data-now-line]')).toBeNull()
    expect(tomorrow.querySelector<HTMLElement>('.car-grid-scroll')!.scrollTop).toBe(yOf('08:00'))
  })
})
