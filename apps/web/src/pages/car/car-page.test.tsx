import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bandsOn,
  carError,
  carItem,
  carList,
  installCarApi,
  markedDays,
  monthCalendar,
  reservation,
  reservationList,
  selectDay,
  setDeviceClock,
} from '../../../test/car'
import { json, networkDown } from '../../../test/fakeApi'
import { signIn } from '../../../test/money'
import { renderApp } from '../../../test/render'

describe('車の画面（CAR-F-005）', () => {
  beforeEach(() => {
    // 端末の時計：日本時間 2026-10-07 20:00（tasks.md の「今」）
    setDeviceClock('2026-10-07 20:00')
    signIn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const withCars = { 'GET /cars': () => json(carList(carItem('BMW'), carItem('ノア'))) }

  const rangeRequestsOf = (requests: Request[]) =>
    requests
      .map((r) => new URL(r.url))
      .filter((u) => u.pathname === '/car-reservations')
      .map((u) => Object.fromEntries(u.searchParams))

  it('[CAR-F-005/AC-1] 父が開くと、10月のカレンダーの7日と8日に印が出て、10月7日の時間割にせいごの帯（8:00〜10:00）と、くうごの帯（19:00〜22:00、「使用中」付き）が出る', async () => {
    installCarApi(
      {
        ...withCars,
        'GET /car-reservations': () =>
          json(
            reservationList([
              reservation({ who: 'seigo', from: '2026-10-07 08:00', to: '2026-10-07 10:00' }),
              reservation({ who: 'kugo', from: '2026-10-07 19:00', to: '2026-10-07 22:00' }),
              reservation({ who: 'mother', from: '2026-10-08 09:00', to: '2026-10-08 10:00' }),
            ]),
          ),
      },
      'father',
    )
    renderApp('/car')

    expect(await markedDays('2026年10月')).toEqual(['10月7日(水)', '10月8日(木)'])
    const [seigo, kugo, ...rest] = await bandsOn('10月7日(水)')
    expect(rest).toEqual([])
    expect(seigo).toHaveTextContent(/ノア.*せいご.*8:00〜10:00/)
    expect(seigo).not.toHaveTextContent('使用中')
    expect(kugo).toHaveTextContent(/ノア.*くうご.*19:00〜22:00/)
    expect(kugo).toHaveTextContent('使用中')
  })

  it('[CAR-F-005/AC-2] 10月9日に予約が無いとき、10月9日を選ぶと時間割に帯は出ず、カレンダーの9日に印は出ない', async () => {
    installCarApi({
      ...withCars,
      'GET /car-reservations': () =>
        json(
          reservationList([
            // 10月9日 0:00 に終わる予約と、10月10日 0:00 に始まる予約（どちらも9日にはかからない）
            reservation({ from: '2026-10-08 22:00', to: '2026-10-09 00:00' }),
            reservation({ from: '2026-10-10 00:00', to: '2026-10-10 02:00' }),
          ]),
        ),
    })
    const { router } = renderApp('/car')
    await selectDay('10月9日(金)')

    expect(await bandsOn('10月9日(金)')).toEqual([])
    expect(await markedDays('2026年10月')).toEqual(['10月8日(木)', '10月10日(土)'])
    expect(router.state.location.search).toBe('?date=2026-10-09')
  })

  it('[CAR-F-005/AC-3] 10月10日 22:00〜10月11日 2:00 は、10日と11日のそれぞれの時間割に「22:00〜10月11日(日) 2:00」の帯で出て、10日と11日の両方に印が出る', async () => {
    installCarApi({
      ...withCars,
      'GET /car-reservations': () =>
        json(reservationList([reservation({ from: '2026-10-10 22:00', to: '2026-10-11 02:00' })])),
    })
    renderApp('/car')

    await selectDay('10月10日(土)')
    const oct10 = await bandsOn('10月10日(土)')
    expect(oct10).toHaveLength(1)
    expect(oct10[0]).toHaveTextContent('22:00〜10月11日(日) 2:00')
    await selectDay('10月11日(日)')
    const oct11 = await bandsOn('10月11日(日)')
    expect(oct11).toHaveLength(1)
    expect(oct11[0]).toHaveTextContent('22:00〜10月11日(日) 2:00')
    expect(await markedDays('2026年10月')).toEqual(['10月10日(土)', '10月11日(日)'])
  })

  it('[CAR-F-005/AC-4] 「使わない」の車「ノア」のくうごの予約は、10月10日の時間割に薄い帯で出て、車の名前に「使わない」と添えてある', async () => {
    installCarApi({
      'GET /cars': () => json(carList(carItem('ノア', { isActive: false }))),
      'GET /car-reservations': () =>
        json(
          reservationList([
            reservation({ carActive: false, from: '2026-10-10 09:00', to: '2026-10-10 12:00' }),
          ]),
        ),
    })
    renderApp('/car?date=2026-10-10')

    const [band, ...rest] = await bandsOn('10月10日(土)')
    expect(rest).toEqual([])
    expect(band).toHaveTextContent(/ノア.*使わない.*くうご/)
    expect(band!.dataset.inactive).toBe('true')
    // 帯を薄く塗るクラスが FullCalendar の帯に付いている
    expect(band!.closest('.car-band-inactive')).not.toBeNull()
  })

  it('[CAR-F-005/AC-10] くうごの「ノア」と母の「フィット」の 10月10日 9:00〜12:00 は、2本の帯にそれぞれ「ノア」「フィット」と出て、色の番号が違う', async () => {
    installCarApi({
      'GET /cars': () =>
        json(carList(carItem('ノア', { colorIndex: 1 }), carItem('フィット', { colorIndex: 0 }))),
      'GET /car-reservations': () =>
        json(
          reservationList([
            reservation({ car: 'ノア', from: '2026-10-10 09:00', to: '2026-10-10 12:00' }),
            reservation({
              car: 'フィット',
              who: 'mother',
              from: '2026-10-10 09:00',
              to: '2026-10-10 12:00',
            }),
          ]),
        ),
    })
    renderApp('/car')
    await selectDay('10月10日(土)')

    const bands = await bandsOn('10月10日(土)')
    expect(
      bands.map((b) => [b.textContent!.match(/ノア|フィット/)![0], b.dataset.colorIndex]),
    ).toEqual([
      ['ノア', '1'],
      ['フィット', '0'],
    ])
    // 「使う」の車の帯は薄くしない
    expect(bands.map((b) => b.dataset.inactive)).toEqual(['false', 'false'])
  })

  it('[CAR-F-005/AC-6] 通信できないと「通信できません。電波の良いところでもう一度開いてください。」と出る', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': networkDown })
    renderApp('/car')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '通信できません。電波の良いところでもう一度開いてください。',
    )
  })

  it('[CAR-F-005/AC-7] 予約を引く API が 500 を返すと「うまく読み込めませんでした。時間をおいてもう一度開いてください。」と出る', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': carError(500, 'internal') })
    renderApp('/car')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'うまく読み込めませんでした。時間をおいてもう一度開いてください。',
    )
  })

  it('[CAR-F-005/AC-8] 車が1台も無いと「車が登録されていません」と出て、車の管理の画面へ進める（時間割は出ない）', async () => {
    installCarApi({
      'GET /cars': () => json(carList()),
      'GET /car-reservations': () => json(reservationList([])),
    })
    renderApp('/car')

    expect(await screen.findByText('車が登録されていません')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /の時間割$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '車の管理へ' })).toHaveAttribute('href', '/car/cars')
  })

  it('[CAR-F-004/AC-9] 日本時間 20:00 に 10月7日 19:00〜22:00 の予約があると、10月7日の時間割の帯に「使用中」と出る', async () => {
    installCarApi({
      ...withCars,
      'GET /car-reservations': () =>
        json(reservationList([reservation({ from: '2026-10-07 19:00', to: '2026-10-07 22:00' })])),
    })
    renderApp('/car')

    const [band] = await bandsOn('10月7日(水)')
    expect(band).toHaveTextContent('使用中')
  })

  // AC ではない確認
  it('月のカレンダーに見えている範囲（9月27日〜11月7日）を1回だけ引き、選んだ日の時間割も同じ結果から出す', async () => {
    const { requests } = installCarApi({
      ...withCars,
      'GET /car-reservations': () =>
        json(reservationList([reservation({ from: '2026-10-20 09:00', to: '2026-10-20 10:00' })])),
    })
    renderApp('/car')
    await monthCalendar('2026年10月')
    await selectDay('10月20日(火)')

    expect(await bandsOn('10月20日(火)')).toHaveLength(1)
    expect(rangeRequestsOf(requests)).toEqual([
      { view: 'range', from: '2026-09-27', to: '2026-11-07' },
    ])
  })

  it('?date の日を選んだ状態で開く', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': () => json(reservationList([])) })
    renderApp('/car?date=2026-10-12')
    expect(await bandsOn('10月12日(月)')).toEqual([])
  })

  it('?date が実在しない日付なら今日（10月7日）を選ぶ', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': () => json(reservationList([])) })
    renderApp('/car?date=2026-02-30')
    expect(await bandsOn('10月7日(水)')).toEqual([])
  })

  it('「予約する」で予約の入力へ、右上のメニューから履歴・車の管理へ進む', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': () => json(reservationList([])) })
    renderApp('/car')

    expect(await screen.findByRole('link', { name: '予約する' })).toHaveAttribute(
      'href',
      '/car/reservations/new',
    )
    await userEvent.click(screen.getByRole('button', { name: 'メニュー' }))
    const items = await screen.findAllByRole('menuitem')
    expect(items.map((i) => [i.textContent, i.getAttribute('href')])).toEqual([
      ['履歴', '/car/history'],
      ['車の管理', '/car/cars'],
    ])
  })

  it('アプリのホームの「車」から車の画面へ進み、カレンダーが出る', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': () => json(reservationList([])) })
    const { router } = renderApp('/')

    await userEvent.click(await screen.findByRole('link', { name: '車' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/car'))
    expect(await monthCalendar('2026年10月')).toBeInTheDocument()
  })
})
