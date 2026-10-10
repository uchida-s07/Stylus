import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { CAR_IDS, carError, carItem, carList, installCarApi } from '../../../test/car'
import { json } from '../../../test/fakeApi'
import { signIn } from '../../../test/money'
import { renderApp } from '../../../test/render'

type Handler = Parameters<typeof installCarApi>[0][string]

// 車の管理の画面を開く。GET /cars は呼ばれるたびに lists を順に返す（最後のものを繰り返す）
function openCars(lists: ReturnType<typeof carList>[], extra: Record<string, Handler> = {}) {
  let calls = 0
  const fake = installCarApi({
    'GET /cars': () => {
      const list = lists[Math.min(calls, lists.length - 1)]!
      calls += 1
      return json(list)
    },
    ...extra,
  })
  return { ...fake, ...renderApp('/car/cars') }
}

const writes = (requests: Request[]) => requests.filter((r) => r.method !== 'GET')

async function register(name: string) {
  await userEvent.type(await screen.findByLabelText('名前'), name)
  await userEvent.click(screen.getByRole('button', { name: '登録する' }))
}

async function rename(car: string, name: string) {
  await userEvent.click(await screen.findByRole('button', { name: `${car}の名前を変える` }))
  const input = await screen.findByLabelText('新しい名前')
  await userEvent.clear(input)
  if (name) await userEvent.type(input, name)
  await userEvent.click(screen.getByRole('button', { name: '保存する' }))
}

describe('車の管理の画面：登録・名前を変える（CAR-F-001・009）', () => {
  beforeEach(() => {
    signIn()
  })

  it('[CAR-F-001/AC-2] 名前を空白だけ（"　"）にして登録すると、登録されず「入力してください」と出る', async () => {
    const { requests } = openCars([carList(carItem('BMW'))])
    await register('　')

    expect(screen.getByLabelText('名前')).toHaveAccessibleDescription('入力してください')
    expect(writes(requests)).toHaveLength(0)
  })

  it('[CAR-F-001/AC-3] 「ノア」があるときに「　ノア　」を登録すると「同じ名前の車があります」と出る', async () => {
    openCars([carList(carItem('ノア'))], {
      'POST /cars': carError(409, 'duplicate_name', '同じ名前の車があります'),
    })
    await register('　ノア　')

    await waitFor(() =>
      expect(screen.getByLabelText('名前')).toHaveAccessibleDescription('同じ名前の車があります'),
    )
  })

  it('[CAR-F-001/AC-4] 「使わない」の「ノア」があるときに「ノア」を登録すると「同じ名前の車があります」と出る', async () => {
    openCars([carList(carItem('ノア', { isActive: false }))], {
      'POST /cars': carError(409, 'duplicate_name', '同じ名前の車があります'),
    })
    await register('ノア')

    await waitFor(() =>
      expect(screen.getByLabelText('名前')).toHaveAccessibleDescription('同じ名前の車があります'),
    )
  })

  it('[CAR-F-009/AC-2] 名前を空白だけにして保存すると、名前は「ノア」のままで「入力してください」と出る', async () => {
    const { requests } = openCars([carList(carItem('ノア'))])
    await rename('ノア', '　')

    expect(screen.getByLabelText('新しい名前')).toHaveAccessibleDescription('入力してください')
    expect(writes(requests)).toHaveLength(0)
  })

  it('[CAR-F-009/AC-3] 「フィット」の名前を「ノア」に変えると「同じ名前の車があります」と出る', async () => {
    openCars([carList(carItem('ノア'), carItem('フィット'))], {
      'PATCH /cars/:id': carError(409, 'duplicate_name', '同じ名前の車があります'),
    })
    await rename('フィット', 'ノア')

    await waitFor(() =>
      expect(screen.getByLabelText('新しい名前')).toHaveAccessibleDescription(
        '同じ名前の車があります',
      ),
    )
  })

  it('[CAR-F-009/AC-5] 名前を変えている間に「ノア」が削除されていたら「この車は見つかりません。」と出る', async () => {
    openCars([carList(carItem('ノア')), carList()], {
      'PATCH /cars/:id': carError(404, 'not_found', 'この車は見つかりません。'),
    })
    await rename('ノア', 'ヴォクシー')

    expect(await screen.findByRole('alert')).toHaveTextContent('この車は見つかりません。')
  })

  // AC ではない確認
  it('登録すると一覧に出て、名前を変えると新しい名前で出る', async () => {
    const { requests } = openCars(
      [
        carList(carItem('BMW')),
        carList(carItem('BMW'), carItem('ノア')),
        carList(carItem('BMW'), { ...carItem('ノア'), name: 'ヴォクシー' }),
      ],
      {
        'POST /cars': () => json({ id: CAR_IDS.ノア, name: 'ノア', isActive: true }, 201),
        'PATCH /cars/:id': () => json({ id: CAR_IDS.ノア, name: 'ヴォクシー', isActive: true }),
      },
    )
    await register('ノア')
    expect(await screen.findByText('ノア')).toBeInTheDocument()
    expect(screen.getByLabelText('名前')).toHaveValue('')
    await rename('ノア', 'ヴォクシー')

    const list = await screen.findByRole('list', { name: '車の一覧' })
    await waitFor(() => expect(within(list).getByText('ヴォクシー')).toBeInTheDocument())
    const bodies = await Promise.all(writes(requests).map((r) => r.clone().json()))
    expect(bodies).toEqual([{ name: 'ノア' }, { name: 'ヴォクシー' }])
  })
})
