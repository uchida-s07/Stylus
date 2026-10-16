import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bandsOn,
  carError,
  carItem,
  carList,
  dayView,
  installCarApi,
  markedDays,
  monthCalendar,
  reservation,
  reservationDetail,
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

  // せいごの「ノア」の予約 9月20日 9:00〜10:00（終わった予約）
  const seigoSep20 = () =>
    reservation({ who: 'seigo', from: '2026-09-20 09:00', to: '2026-09-20 10:00' })

  // 予約を引く要求が、その日（from = to = date）を引いたときだけ予約を返す
  const onDay = (request: Request, date: string, r: ReturnType<typeof reservation>) => {
    const q = new URL(request.url).searchParams
    return q.get('from') === date && q.get('to') === date ? [r] : []
  }

  it('[CAR-F-005/AC-1] 父が開くと、10月のカレンダーの7日と8日に印が出る', async () => {
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
  })

  it('[CAR-F-005/AC-20] 父が10月のカレンダーで7日をタップすると、10月7日の時間割の画面に移り、せいごの帯（8:00〜10:00）と、くうごの帯（19:00〜22:00、「使用中」付き）が出る', async () => {
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
    const { router } = renderApp('/car')
    await monthCalendar('2026年10月')
    await selectDay('10月7日(水)')

    const [seigo, kugo, ...rest] = await bandsOn('10月7日(水)')
    expect(rest).toEqual([])
    expect(seigo).toHaveTextContent(/ノア.*せいご.*8:00〜10:00/)
    expect(seigo).not.toHaveTextContent('使用中')
    expect(kugo).toHaveTextContent(/ノア.*くうご.*19:00〜22:00/)
    expect(kugo).toHaveTextContent('使用中')
    expect(router.state.location.search).toBe('?date=2026-10-07')
  })

  it('[CAR-F-004/AC-1] 母が車の画面で10日をタップすると、10月10日の時間割に「ノア」「くうご」「9:00〜12:00」「大学」の帯が出る', async () => {
    installCarApi(
      {
        ...withCars,
        'GET /car-reservations': () =>
          json(
            reservationList([
              reservation({
                who: 'kugo',
                from: '2026-10-10 09:00',
                to: '2026-10-10 12:00',
                destination: '大学',
              }),
            ]),
          ),
      },
      'mother',
    )
    renderApp('/car')
    await selectDay('10月10日(土)')

    const [band, ...rest] = await bandsOn('10月10日(土)')
    expect(rest).toEqual([])
    expect(band).toHaveTextContent(/ノア.*くうご.*9:00〜12:00.*大学/)
  })

  it('[CAR-F-005/AC-2] 10月9日に予約が無いとき、カレンダーの9日に印は出ず、9日をタップすると10月9日の時間割に帯は出ない', async () => {
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

    expect(await markedDays('2026年10月')).toEqual(['10月8日(木)', '10月10日(土)'])
    await selectDay('10月9日(金)')
    expect(await bandsOn('10月9日(金)')).toEqual([])
    expect(router.state.location.search).toBe('?date=2026-10-09')
  })

  it('[CAR-F-005/AC-3] 10月10日 22:00〜10月11日 2:00 は、10月のカレンダーの10日と11日の両方に印が出る', async () => {
    installCarApi({
      ...withCars,
      'GET /car-reservations': () =>
        json(reservationList([reservation({ from: '2026-10-10 22:00', to: '2026-10-11 02:00' })])),
    })
    renderApp('/car')

    expect(await markedDays('2026年10月')).toEqual(['10月10日(土)', '10月11日(日)'])
  })

  it('[CAR-F-005/AC-21] 10月10日 22:00〜10月11日 2:00 は、10日をタップすると10月10日の時間割に「22:00〜10月11日(日) 2:00」の帯で出る', async () => {
    installCarApi({
      ...withCars,
      'GET /car-reservations': () =>
        json(reservationList([reservation({ from: '2026-10-10 22:00', to: '2026-10-11 02:00' })])),
    })
    renderApp('/car')
    await selectDay('10月10日(土)')

    const bands = await bandsOn('10月10日(土)')
    expect(bands).toHaveLength(1)
    expect(bands[0]).toHaveTextContent('22:00〜10月11日(日) 2:00')
  })

  it('[CAR-F-005/AC-22] 10月10日 22:00〜10月11日 2:00 は、11日をタップすると10月11日の時間割に「22:00〜10月11日(日) 2:00」の帯で出る', async () => {
    installCarApi({
      ...withCars,
      'GET /car-reservations': () =>
        json(reservationList([reservation({ from: '2026-10-10 22:00', to: '2026-10-11 02:00' })])),
    })
    renderApp('/car')
    await selectDay('10月11日(日)')

    const bands = await bandsOn('10月11日(日)')
    expect(bands).toHaveLength(1)
    expect(bands[0]).toHaveTextContent('22:00〜10月11日(日) 2:00')
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

  it('[CAR-F-005/AC-5] 母が時間割でくうごの予約の帯を押すと、行き先「大学」とメモ「帰りに給油する」が出る', async () => {
    const detail = reservationDetail({
      from: '2026-10-10 09:00',
      to: '2026-10-10 12:00',
      destination: '大学',
      memo: '帰りに給油する',
    })
    installCarApi(
      {
        ...withCars,
        'GET /car-reservations': () => json(reservationList([detail])),
        'GET /car-reservations/:id': () => json(detail),
      },
      'mother',
    )
    const { router } = renderApp('/car?date=2026-10-10')
    const [band] = await bandsOn('10月10日(土)')
    await userEvent.click(band!)

    expect(await screen.findByText('帰りに給油する')).toBeInTheDocument()
    expect(screen.getByText('大学')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/car/reservations/${detail.id}`)
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

  it('[CAR-F-005/AC-8] 車が1台も無いと「車が登録されていません」と出て、車の管理の画面へ進める（月のカレンダーは出ない）', async () => {
    installCarApi({
      'GET /cars': () => json(carList()),
      'GET /car-reservations': () => json(reservationList([])),
    })
    renderApp('/car')

    expect(await screen.findByText('車が登録されていません')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /のカレンダー$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '車の管理へ' })).toHaveAttribute('href', '/car/cars')
  })

  it('[CAR-F-004/AC-9] 日本時間 20:00 に 10月7日 19:00〜22:00 の予約があると、10月7日の時間割の帯に「使用中」と出る', async () => {
    installCarApi({
      ...withCars,
      'GET /car-reservations': () =>
        json(reservationList([reservation({ from: '2026-10-07 19:00', to: '2026-10-07 22:00' })])),
    })
    renderApp('/car?date=2026-10-07')

    const [band] = await bandsOn('10月7日(水)')
    expect(band).toHaveTextContent('使用中')
  })

  it('[CAR-F-005/AC-9] 10月のカレンダーから前の月へ移ると、2026年9月のカレンダーの20日に印が出る', async () => {
    const { requests } = installCarApi({
      ...withCars,
      'GET /car-reservations': () => json(reservationList([seigoSep20()])),
    })
    const { router } = renderApp('/car')
    await monthCalendar('2026年10月')
    await userEvent.click(screen.getByRole('button', { name: '前の月' }))

    expect(await markedDays('2026年9月')).toEqual(['9月20日(日)'])
    // 9月の見えている範囲を引き直している
    expect(rangeRequestsOf(requests).at(-1)).toEqual({
      view: 'range',
      from: '2026-08-30',
      to: '2026-10-10',
    })
    expect(router.state.location.search).toBe('?month=2026-09')
  })

  it('[CAR-F-005/AC-26] 2026年9月のカレンダーで20日をタップすると、9月20日の時間割にせいごの帯（9:00〜10:00）が出る', async () => {
    installCarApi({
      ...withCars,
      'GET /car-reservations': () => json(reservationList([seigoSep20()])),
    })
    renderApp('/car?month=2026-09')
    await monthCalendar('2026年9月')
    await selectDay('9月20日(日)')

    const [band, ...rest] = await bandsOn('9月20日(日)')
    expect(rest).toEqual([])
    expect(band).toHaveTextContent(/ノア.*せいご.*9:00〜10:00/)
  })

  it('[CAR-F-005/AC-11] 開いた後に通信できなくなると、次の月へ移ったときに「通信できません。電波の良いところでもう一度開いてください。」と出る', async () => {
    let calls = 0
    installCarApi({
      ...withCars,
      'GET /car-reservations': (request) => {
        calls += 1
        return calls === 1 ? json(reservationList([])) : networkDown(request)
      },
    })
    renderApp('/car')
    await monthCalendar('2026年10月')
    await userEvent.click(screen.getByRole('button', { name: '次の月' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '通信できません。電波の良いところでもう一度開いてください。',
    )
  })

  it('[CAR-F-005/AC-12] 10月10日の時間割の帯を押して予約の中身を開き、「車へ」で戻ると、10月10日の時間割の画面に戻り、その帯が出る', async () => {
    const detail = reservationDetail({ from: '2026-10-10 09:00', to: '2026-10-10 12:00' })
    installCarApi({
      ...withCars,
      'GET /car-reservations': () => json(reservationList([detail])),
      'GET /car-reservations/:id': () => json(detail),
    })
    const { router } = renderApp('/car')
    await selectDay('10月10日(土)')
    const [band] = await bandsOn('10月10日(土)')
    await userEvent.click(band!)
    await userEvent.click(await screen.findByRole('link', { name: '車へ' }))

    const bands = await bandsOn('10月10日(土)')
    expect(bands.map((b) => b.dataset.reservationId)).toEqual([detail.id])
    expect(router.state.location.search).toBe('?date=2026-10-10')
  })

  it('[CAR-F-005/AC-13] 10月のカレンダーから次の月へ移ると、2026年11月のカレンダーが出て、1日に印が出る', async () => {
    installCarApi({
      ...withCars,
      'GET /car-reservations': () =>
        json(
          reservationList([
            reservation({ who: 'mother', from: '2026-11-01 09:00', to: '2026-11-01 10:00' }),
          ]),
        ),
    })
    const { router } = renderApp('/car')
    await monthCalendar('2026年10月')
    await userEvent.click(screen.getByRole('button', { name: '次の月' }))

    expect(await markedDays('2026年11月')).toEqual(['11月1日(日)'])
    expect(router.state.location.search).toBe('?month=2026-11')
  })

  it('[CAR-F-005/AC-18] 11月1日の時間割の画面で「月へ戻る」を押すと、2026年11月のカレンダーが出る', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': () => json(reservationList([])) })
    const { router } = renderApp('/car?date=2026-11-01')
    await dayView('11月1日(日)')
    await userEvent.click(screen.getByRole('button', { name: '月へ戻る' }))

    expect(await monthCalendar('2026年11月')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?month=2026-11')
  })

  it('[CAR-F-005/AC-19] 10月10日の時間割の画面で「次の日」を押すと、10月11日の時間割の画面に移り、くうごの帯が出る', async () => {
    const r = reservation({ from: '2026-10-11 09:00', to: '2026-10-11 12:00' })
    installCarApi({
      ...withCars,
      'GET /car-reservations': (request) => json(reservationList(onDay(request, '2026-10-11', r))),
    })
    const { router } = renderApp('/car?date=2026-10-10')
    expect(await bandsOn('10月10日(土)')).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: '次の日' }))

    const bands = await bandsOn('10月11日(日)')
    expect(bands.map((b) => b.dataset.reservationId)).toEqual([r.id])
    expect(bands[0]).toHaveTextContent(/ノア.*くうご/)
    expect(router.state.location.search).toBe('?date=2026-10-11')
  })

  it('[CAR-F-005/AC-23] 10月11日の時間割の画面で「前の日」を押すと、10月10日の時間割の画面に移り、くうごの帯が出る', async () => {
    const r = reservation({ from: '2026-10-10 09:00', to: '2026-10-10 12:00' })
    installCarApi({
      ...withCars,
      'GET /car-reservations': (request) => json(reservationList(onDay(request, '2026-10-10', r))),
    })
    const { router } = renderApp('/car?date=2026-10-11')
    expect(await bandsOn('10月11日(日)')).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: '前の日' }))

    const bands = await bandsOn('10月10日(土)')
    expect(bands.map((b) => b.dataset.reservationId)).toEqual([r.id])
    expect(bands[0]).toHaveTextContent(/ノア.*くうご/)
    expect(router.state.location.search).toBe('?date=2026-10-10')
  })

  // AC ではない確認
  it('月の画面は見えている範囲（9月27日〜11月7日）を1回だけ引き、日の画面はその日だけを引く', async () => {
    const { requests } = installCarApi({
      ...withCars,
      'GET /car-reservations': () =>
        json(reservationList([reservation({ from: '2026-10-20 09:00', to: '2026-10-20 10:00' })])),
    })
    renderApp('/car')
    expect(await markedDays('2026年10月')).toEqual(['10月20日(火)'])
    await selectDay('10月20日(火)')

    expect(await bandsOn('10月20日(火)')).toHaveLength(1)
    expect(rangeRequestsOf(requests)).toEqual([
      { view: 'range', from: '2026-09-27', to: '2026-11-07' },
      { view: 'range', from: '2026-10-20', to: '2026-10-20' },
    ])
  })

  it('日をタップした後に端末の「戻る」で月のカレンダーの画面へ戻る', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': () => json(reservationList([])) })
    const { router } = renderApp('/car?month=2026-11')
    await monthCalendar('2026年11月')
    await selectDay('11月12日(木)')

    await act(() => router.navigate(-1))
    expect(await monthCalendar('2026年11月')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?month=2026-11')
  })

  it('?date の日の時間割の画面を開く', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': () => json(reservationList([])) })
    renderApp('/car?date=2026-10-12')
    expect(await bandsOn('10月12日(月)')).toEqual([])
  })

  it('?date が実在しない日付なら今月の月のカレンダーを出す', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': () => json(reservationList([])) })
    renderApp('/car?date=2026-02-30')
    expect(await monthCalendar('2026年10月')).toBeInTheDocument()
  })

  it('?month の月のカレンダーを開く。形が違うときは今月', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': () => json(reservationList([])) })
    const { router } = renderApp('/car?month=2027-01')
    expect(await monthCalendar('2027年1月')).toBeInTheDocument()

    await act(() => router.navigate('/car?month=2027-13'))
    expect(await monthCalendar('2026年10月')).toBeInTheDocument()
  })

  it('次の月から「今日」で今月（10月）のカレンダーに戻る', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': () => json(reservationList([])) })
    const { router } = renderApp('/car')
    await monthCalendar('2026年10月')

    await userEvent.click(screen.getByRole('button', { name: '次の月' }))
    await monthCalendar('2026年11月')
    await userEvent.click(screen.getByRole('button', { name: '今日' }))
    expect(await monthCalendar('2026年10月')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?month=2026-10')
  })

  it('日の画面でも、車が1台も無いと「車が登録されていません」と出て、車の管理の画面へ進める', async () => {
    installCarApi({
      'GET /cars': () => json(carList()),
      'GET /car-reservations': () => json(reservationList([])),
    })
    renderApp('/car?date=2026-10-10')

    expect(await screen.findByText('車が登録されていません')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /の時間割$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '車の管理へ' })).toHaveAttribute('href', '/car/cars')
    expect(screen.getByRole('button', { name: '月へ戻る' })).toBeInTheDocument()
  })

  it.each([
    ['月の画面', '/car'],
    ['日の画面', '/car?date=2026-10-10'],
  ])(
    '%sでも「予約する」で予約の入力へ、右上のメニューから履歴・車の管理へ進む',
    async (_, path) => {
      installCarApi({ ...withCars, 'GET /car-reservations': () => json(reservationList([])) })
      renderApp(path)
      // 読み込みとカレンダーの描画が済んでからメニューを開く（負荷が高いと描画の途中で開いて間に合わないことがある）
      await screen.findByRole('region', { name: /(のカレンダー|の時間割)$/ }, { timeout: 4000 })

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
    },
  )

  it('アプリのホームの「車」から車の画面へ進み、今月のカレンダーが出る', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': () => json(reservationList([])) })
    const { router } = renderApp('/')

    await userEvent.click(await screen.findByRole('link', { name: '車' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/car'))
    expect(await monthCalendar('2026年10月')).toBeInTheDocument()
  })
})
