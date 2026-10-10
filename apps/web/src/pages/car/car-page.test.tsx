import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  carError,
  carItem,
  carList,
  installCarApi,
  reservation,
  reservationList,
  setDeviceClock,
} from '../../../test/car'
import { json, networkDown } from '../../../test/fakeApi'
import { signIn } from '../../../test/money'
import { renderApp } from '../../../test/render'

describe('車の画面（CAR-F-005）', () => {
  beforeEach(() => {
    // 端末の時計：日本時間 2026-10-07 20:00（tasks.md D-3）
    setDeviceClock('2026-10-07 20:00')
    signIn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const withCars = { 'GET /cars': () => json(carList(carItem('BMW'), carItem('ノア'))) }

  function dateSection(heading: string) {
    return screen.findByRole('region', { name: heading })
  }

  it('[CAR-F-005/AC-1] 「10月7日(水)」の下にくうごの予約が「使用中」付きで、「10月8日(木)」の下に母の予約が出る', async () => {
    installCarApi(
      {
        ...withCars,
        'GET /car-reservations': () =>
          json(
            reservationList([
              reservation({ who: 'kugo', from: '2026-10-07 19:00', to: '2026-10-07 22:00' }),
              reservation({ who: 'mother', from: '2026-10-08 09:00', to: '2026-10-08 10:00' }),
            ]),
          ),
      },
      'father',
    )
    renderApp('/car')

    const oct7 = await dateSection('10月7日(水)')
    const kugoRow = within(oct7).getByRole('link')
    expect(kugoRow).toHaveTextContent(/ノア.*くうご/)
    expect(kugoRow).toHaveTextContent('19:00〜22:00')
    expect(within(kugoRow).getByText('使用中')).toBeInTheDocument()
    const oct8 = await dateSection('10月8日(木)')
    const motherRow = within(oct8).getByRole('link')
    expect(motherRow).toHaveTextContent(/ノア.*母.*9:00〜10:00/)
    expect(motherRow).not.toHaveTextContent('使用中')
    expect(screen.queryByText(/せいご/)).not.toBeInTheDocument()
  })

  it('[CAR-F-005/AC-2] これからの予約が無いと「これからの予約はありません」と出る', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': () => json(reservationList([])) })
    renderApp('/car')

    expect(await screen.findByText('これからの予約はありません')).toBeInTheDocument()
  })

  it('[CAR-F-005/AC-3] 10月10日 22:00〜10月11日 2:00 は「10月10日(土)」の下に「22:00〜10月11日(日) 2:00」と出る', async () => {
    installCarApi({
      ...withCars,
      'GET /car-reservations': () =>
        json(reservationList([reservation({ from: '2026-10-10 22:00', to: '2026-10-11 02:00' })])),
    })
    renderApp('/car')

    const oct10 = await dateSection('10月10日(土)')
    expect(within(oct10).getByRole('link')).toHaveTextContent('22:00〜10月11日(日) 2:00')
    expect(screen.queryByRole('region', { name: '10月11日(日)' })).not.toBeInTheDocument()
  })

  it('[CAR-F-005/AC-4] 「使わない」の車「ノア」のくうごの予約が出て、車の名前に「使わない」と添えてある', async () => {
    installCarApi({
      'GET /cars': () => json(carList(carItem('ノア', { isActive: false }))),
      'GET /car-reservations': () =>
        json(
          reservationList([
            reservation({ carActive: false, from: '2026-10-10 09:00', to: '2026-10-10 12:00' }),
          ]),
        ),
    })
    renderApp('/car')

    const oct10 = await dateSection('10月10日(土)')
    expect(within(oct10).getByRole('link')).toHaveTextContent(/ノア.*使わない.*くうご/)
  })

  it('[CAR-F-005/AC-6] 通信できないと「通信できません。電波の良いところでもう一度開いてください。」と出る', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': networkDown })
    renderApp('/car')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '通信できません。電波の良いところでもう一度開いてください。',
    )
  })

  it('[CAR-F-005/AC-7] 予定の API が 500 を返すと「うまく読み込めませんでした。時間をおいてもう一度開いてください。」と出る', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': carError(500, 'internal') })
    renderApp('/car')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'うまく読み込めませんでした。時間をおいてもう一度開いてください。',
    )
  })

  it('[CAR-F-005/AC-8] 車が1台も無いと「車が登録されていません」と出て、車の管理の画面へ進める（「これからの予約はありません」は出ない）', async () => {
    installCarApi({
      'GET /cars': () => json(carList()),
      'GET /car-reservations': () => json(reservationList([])),
    })
    renderApp('/car')

    expect(await screen.findByText('車が登録されていません')).toBeInTheDocument()
    expect(screen.queryByText('これからの予約はありません')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '車の管理へ' })).toHaveAttribute('href', '/car/cars')
  })

  it('[CAR-F-004/AC-9] 日本時間 20:00 に 10月7日 19:00〜22:00 の予約があると、予定に「使用中」と出る', async () => {
    installCarApi({
      ...withCars,
      'GET /car-reservations': () =>
        json(reservationList([reservation({ from: '2026-10-07 19:00', to: '2026-10-07 22:00' })])),
    })
    renderApp('/car')

    const oct7 = await dateSection('10月7日(水)')
    expect(within(oct7).getByText('使用中')).toBeInTheDocument()
  })

  // AC ではない確認
  it('予約を押すと予約の中身へ、「予約する」で予約の入力へ、右上のメニューから履歴・車の管理へ進む', async () => {
    const r = reservation({ from: '2026-10-10 09:00', to: '2026-10-10 12:00', destination: '大学' })
    installCarApi({ ...withCars, 'GET /car-reservations': () => json(reservationList([r])) })
    renderApp('/car')

    const row = await screen.findByRole('link', { name: /大学/ })
    expect(row).toHaveAttribute('href', `/car/reservations/${r.id}`)
    expect(screen.getByRole('link', { name: '予約する' })).toHaveAttribute(
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

  it('アプリのホームの「車」から車の画面へ進む', async () => {
    installCarApi({ ...withCars, 'GET /car-reservations': () => json(reservationList([])) })
    const { router } = renderApp('/')

    await userEvent.click(await screen.findByRole('link', { name: '車' }))
    expect(router.state.location.pathname).toBe('/car')
    expect(await screen.findByText('これからの予約はありません')).toBeInTheDocument()
  })
})
