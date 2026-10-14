import type { ReservationDetail } from '@stylus/shared'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  carError,
  carItem,
  carList,
  installCarApi,
  monthCalendar,
  reservationDetail,
  reservationList,
  setDeviceClock,
} from '../../../test/car'
import { json } from '../../../test/fakeApi'
import { signIn, type FamilyKey } from '../../../test/money'
import { renderApp } from '../../../test/render'

type Handler = Parameters<typeof installCarApi>[0][string]

// 予約の中身を開く。GET は呼ばれるたびに details を順に返す（最後のものを繰り返す）
function openDetail(
  details: ReservationDetail[],
  options: { who?: FamilyKey; del?: Handler; upcoming?: ReservationDetail[] } = {},
) {
  let calls = 0
  const { who = 'kugo', del = () => new Response(null, { status: 204 }), upcoming = [] } = options
  const fake = installCarApi(
    {
      'GET /car-reservations/:id': () => {
        const d = details[Math.min(calls, details.length - 1)]!
        calls += 1
        return json(d)
      },
      'DELETE /car-reservations/:id': del,
      'GET /cars': () => json(carList(carItem('ノア'))),
      'GET /car-reservations': () => json(reservationList(upcoming)),
    },
    who,
  )
  return { ...fake, ...renderApp(`/car/reservations/${details[0]!.id}`) }
}

const kugoNotStarted = (overrides: Partial<Parameters<typeof reservationDetail>[0]> = {}) =>
  reservationDetail({
    who: 'kugo',
    from: '2026-10-10 09:00',
    to: '2026-10-10 12:00',
    isMine: true,
    ...overrides,
  })

const deletesOf = (requests: Request[]) => requests.filter((r) => r.method === 'DELETE')

async function cancelAndConfirm() {
  await userEvent.click(await screen.findByRole('button', { name: '取り消す' }))
  const dialog = await screen.findByRole('dialog', { name: 'この予約を取り消しますか？' })
  await userEvent.click(
    (await screen.findAllByRole('button', { name: '取り消す' })).find((b) => dialog.contains(b))!,
  )
}

describe('予約の中身の画面（CAR-F-005〜007）', () => {
  beforeEach(() => {
    setDeviceClock('2026-10-07 20:00')
    signIn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('[CAR-F-005/AC-5] 母がくうごの予約を開くと、行き先「大学」とメモ「帰りに給油する」が出る', async () => {
    openDetail([kugoNotStarted({ isMine: false, destination: '大学', memo: '帰りに給油する' })], {
      who: 'mother',
    })

    expect(await screen.findByText('大学')).toBeInTheDocument()
    expect(screen.getByText('帰りに給油する')).toBeInTheDocument()
    expect(screen.getByText('くうご')).toBeInTheDocument()
    expect(screen.getByText('10月10日(土) 9:00〜12:00')).toBeInTheDocument()
  })

  it('[CAR-F-006/AC-5] 母がくうごの予約を開くと「直す」は出ない', async () => {
    openDetail([kugoNotStarted({ isMine: false, destination: '大学' })], { who: 'mother' })

    expect(await screen.findByText('大学')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '直す' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取り消す' })).not.toBeInTheDocument()
  })

  it('[CAR-F-006/AC-10] 10月7日 20:00 に、くうごが終わった 8:00〜10:00 を開くと「直す」は出ない', async () => {
    openDetail([
      kugoNotStarted({ from: '2026-10-07 08:00', to: '2026-10-07 10:00', destination: '駅' }),
    ])

    expect(await screen.findByText('駅')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '直す' })).not.toBeInTheDocument()
  })

  it('[CAR-F-007/AC-1] くうごが「取り消す」を押し、確認で「取り消す」を選ぶと、取り消されて車の画面に戻る', async () => {
    const r = kugoNotStarted({ destination: '大学' })
    const { requests, router } = openDetail([r])
    await cancelAndConfirm()

    await waitFor(() => expect(router.state.location.pathname).toBe('/car'))
    // 戻った先の日付と時間割は T-9 で確かめる
    expect(await monthCalendar('2026年10月')).toBeInTheDocument()
    expect(deletesOf(requests).map((d) => new URL(d.url).pathname)).toEqual([
      `/car-reservations/${r.id}`,
    ])
  })

  it('[CAR-F-007/AC-2] 「取り消す」を押し、確認で「キャンセル」を選ぶと、予約は残る', async () => {
    const { requests, router } = openDetail([kugoNotStarted({ destination: '大学' })])
    await userEvent.click(await screen.findByRole('button', { name: '取り消す' }))
    await userEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'この予約を取り消しますか？' })).toBeNull(),
    )
    expect(deletesOf(requests)).toHaveLength(0)
    expect(router.state.location.pathname).toMatch(/^\/car\/reservations\//)
    expect(screen.getByText('大学')).toBeInTheDocument()
  })

  it('[CAR-F-007/AC-4] 10月10日 10:00 に、くうごが使用中の予約を開くと「取り消す」は出ない（「直す」は出る）', async () => {
    setDeviceClock('2026-10-10 10:00')
    openDetail([kugoNotStarted({ destination: '大学' })])

    expect(await screen.findByRole('link', { name: '直す' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取り消す' })).not.toBeInTheDocument()
  })

  it('[CAR-F-007/AC-5] 端末 B で取り消していたら、端末 A で「取り消す」を選ぶと「この予約は見つかりません。」と出る', async () => {
    openDetail([kugoNotStarted()], {
      del: carError(404, 'not_found', 'この予約は見つかりません。'),
    })
    await cancelAndConfirm()

    expect(await screen.findByText('この予約は見つかりません。')).toBeInTheDocument()
  })

  it('[CAR-F-007/AC-6] 8:55 に確認を開き、9:00 を過ぎてから「取り消す」を選ぶと「この予約はもう始まっているため取り消せません。…」と出る', async () => {
    setDeviceClock('2026-10-10 08:55')
    const r = kugoNotStarted()
    openDetail([r, r], {
      del: carError(409, 'state_changed', 'この予約はもう始まっているため取り消せません。'),
    })
    await cancelAndConfirm()

    expect(
      await screen.findByText(
        'この予約はもう始まっているため取り消せません。終了の日時を直してください。',
      ),
    ).toBeInTheDocument()
  })

  it('[CAR-F-007/AC-7] 10月7日 20:00 に、くうごが終わった 8:00〜10:00 を開くと「取り消す」は出ない', async () => {
    openDetail([
      kugoNotStarted({ from: '2026-10-07 08:00', to: '2026-10-07 10:00', destination: '駅' }),
    ])

    expect(await screen.findByText('駅')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取り消す' })).not.toBeInTheDocument()
  })

  it('[CAR-F-007/AC-8] 端末 B で終了を 13:00 に直していても、端末 A の「取り消す」で取り消されて車の画面に戻る', async () => {
    // API は版を見ずに取り消す（204）
    const { router } = openDetail([kugoNotStarted()])
    await cancelAndConfirm()

    await waitFor(() => expect(router.state.location.pathname).toBe('/car'))
    expect(await monthCalendar('2026年10月')).toBeInTheDocument()
  })

  // AC ではない確認
  it('開いた予約が見つからなければ「この予約は見つかりません。」と出る', async () => {
    installCarApi({
      'GET /car-reservations/:id': carError(404, 'not_found', 'この予約は見つかりません。'),
    })
    renderApp('/car/reservations/50000000-0000-4000-8000-999999999999')

    expect(await screen.findByText('この予約は見つかりません。')).toBeInTheDocument()
  })

  it('本人のまだ始まっていない予約には「直す」（直す画面へ）と「取り消す」が出る', async () => {
    const r = kugoNotStarted()
    openDetail([r])

    expect(await screen.findByRole('link', { name: '直す' })).toHaveAttribute(
      'href',
      `/car/reservations/${r.id}/edit`,
    )
    expect(screen.getByRole('button', { name: '取り消す' })).toBeInTheDocument()
  })
})
