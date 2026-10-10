import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installCarApi, reservation, reservationList, setDeviceClock } from '../../../test/car'
import { json } from '../../../test/fakeApi'
import { signIn } from '../../../test/money'
import { renderApp } from '../../../test/render'

describe('車の履歴の画面（CAR-F-008）', () => {
  beforeEach(() => {
    setDeviceClock('2026-10-07 20:00')
    signIn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function rows() {
    const main = await screen.findByRole('main', { name: '車の履歴' })
    return Array.from(main.querySelectorAll('a[href^="/car/reservations/"]')).map(
      (a) => a.textContent,
    )
  }

  it('[CAR-F-008/AC-1] 履歴を開くと、母（10月6日）・せいご（10月5日）の順に出る', async () => {
    installCarApi({
      'GET /car-reservations': () =>
        json(
          reservationList([
            reservation({ who: 'mother', from: '2026-10-06 13:00', to: '2026-10-06 15:00' }),
            reservation({ who: 'seigo', from: '2026-10-05 09:00', to: '2026-10-05 10:00' }),
          ]),
        ),
    })
    renderApp('/car/history')

    await waitFor(async () => expect(await rows()).toHaveLength(2))
    const [first, second] = await rows()
    expect(first).toMatch(/ノア.*母.*10月6日\(火\) 13:00〜15:00/)
    expect(second).toMatch(/ノア.*せいご.*10月5日\(月\) 9:00〜10:00/)
    expect(screen.queryByText(/くうご/)).not.toBeInTheDocument()
  })

  it('[CAR-F-008/AC-2] 終わった予約が無いと「終わった予約はありません」と出る', async () => {
    installCarApi({ 'GET /car-reservations': () => json(reservationList([])) })
    renderApp('/car/history')

    expect(await screen.findByText('終わった予約はありません')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'もっと見る' })).not.toBeInTheDocument()
  })

  it('[CAR-F-008/AC-3] 終わった予約が31件あると、最初は30件が出て、「もっと見る」の後に31件目が出る', async () => {
    const all = Array.from({ length: 31 }, (_, i) => {
      const day = String(1 + Math.floor((30 - i) / 10)).padStart(2, '0')
      const hour = String(8 + ((30 - i) % 10)).padStart(2, '0')
      return reservation({
        who: 'kugo',
        destination: `行き先${i + 1}`,
        from: `2026-10-${day} ${hour}:00`,
        to: `2026-10-${day} ${hour}:30`,
      })
    })
    const cursor = `cursor-after-30`
    const { requests } = installCarApi({
      'GET /car-reservations': (request) => {
        const before = new URL(request.url).searchParams.get('before')
        return json(
          before === cursor
            ? reservationList(all.slice(30))
            : reservationList(all.slice(0, 30), cursor),
        )
      },
    })
    renderApp('/car/history')

    await waitFor(async () => expect(await rows()).toHaveLength(30))
    expect(screen.queryByText('行き先31')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'もっと見る' }))

    expect(await screen.findByText('行き先31')).toBeInTheDocument()
    expect(await rows()).toHaveLength(31)
    expect(screen.queryByRole('button', { name: 'もっと見る' })).not.toBeInTheDocument()
    const queries = requests
      .filter((r) => new URL(r.url).pathname === '/car-reservations')
      .map((r) => Object.fromEntries(new URL(r.url).searchParams))
    expect(queries).toEqual([{ view: 'past' }, { view: 'past', before: cursor }])
  })
})
