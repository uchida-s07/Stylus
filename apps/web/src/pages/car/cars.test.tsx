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

describe('車の管理の画面：使わない・使う・削除（CAR-F-002・003）', () => {
  beforeEach(() => {
    signIn()
  })

  // 車の行（li）
  async function carRow(name: string) {
    const list = await screen.findByRole('list', { name: '車の一覧' })
    const row = within(list)
      .getAllByRole('listitem')
      .find((li) => within(li).queryByText(name))
    if (!row) throw new Error(`${name} の行が無い`)
    return row
  }

  async function chooseInDialog(title: string, choice: string) {
    const dialog = await screen.findByRole('dialog', { name: title })
    await userEvent.click(within(dialog).getByRole('button', { name: choice }))
    return dialog
  }

  const deactivate = async (choice: '使わないにする' | 'キャンセル') => {
    await userEvent.click(await screen.findByRole('button', { name: 'ノアを使わないにする' }))
    return chooseInDialog('「ノア」を使わないにしますか？', choice)
  }

  const remove = async (choice: '削除する' | 'キャンセル') => {
    await userEvent.click(await screen.findByRole('button', { name: 'ノアを削除' }))
    return chooseInDialog('「ノア」を削除しますか？', choice)
  }

  it('[CAR-F-002/AC-1] 母が「使わないにする」を押し、確認で「使わないにする」を選ぶと、「ノア」に「使わない」と出る', async () => {
    const { requests } = openCars(
      [carList(carItem('ノア')), carList(carItem('ノア', { isActive: false }))],
      { 'PATCH /cars/:id': () => json({ id: CAR_IDS.ノア, name: 'ノア', isActive: false }) },
    )
    await deactivate('使わないにする')

    await waitFor(async () =>
      expect(within(await carRow('ノア')).getByText('使わない')).toBeInTheDocument(),
    )
    expect(await writes(requests)[0]!.clone().json()).toEqual({ isActive: false })
  })

  it('[CAR-F-002/AC-3] これからの予約が1件ある「ノア」は、確認に「この車にはこれからの予約が1件あります。予約はそのまま残ります。」と出る', async () => {
    const { requests } = openCars(
      [carList(carItem('ノア', { hasReservations: true, upcomingCount: 1 }))],
      {
        'PATCH /cars/:id': () => json({ id: CAR_IDS.ノア, name: 'ノア', isActive: false }),
      },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'ノアを使わないにする' }))
    const dialog = await screen.findByRole('dialog', { name: '「ノア」を使わないにしますか？' })

    expect(dialog).toHaveTextContent(
      'この車にはこれからの予約が1件あります。予約はそのまま残ります。',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: '使わないにする' }))
    await waitFor(() => expect(writes(requests)).toHaveLength(1))
  })

  it('[CAR-F-002/AC-4] 「使わないにする」を押し、確認で「キャンセル」を選ぶと、「ノア」は「使う」のまま', async () => {
    const { requests } = openCars([carList(carItem('ノア'))])
    await deactivate('キャンセル')

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '「ノア」を使わないにしますか？' })).toBeNull(),
    )
    expect(writes(requests)).toHaveLength(0)
    expect(within(await carRow('ノア')).queryByText('使わない')).not.toBeInTheDocument()
  })

  it('[CAR-F-002/AC-5] 確認を開いている間に「ノア」が削除されていたら「この車は見つかりません。」と出る', async () => {
    openCars([carList(carItem('ノア')), carList()], {
      'PATCH /cars/:id': carError(404, 'not_found', 'この車は見つかりません。'),
    })
    await deactivate('使わないにする')

    expect(await screen.findByRole('alert')).toHaveTextContent('この車は見つかりません。')
  })

  it('[CAR-F-002/AC-6] 確認を開いている間にせいごが「使わない」にしていても、知らせは出ず「ノア」は「使わない」になっている', async () => {
    openCars([carList(carItem('ノア')), carList(carItem('ノア', { isActive: false }))], {
      'PATCH /cars/:id': () => json({ id: CAR_IDS.ノア, name: 'ノア', isActive: false }),
    })
    await deactivate('使わないにする')

    await waitFor(async () =>
      expect(within(await carRow('ノア')).getByText('使わない')).toBeInTheDocument(),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('[CAR-F-003/AC-1] 予約の無い「ノア」を「削除」し、確認で「削除する」を選ぶと、一覧から消える', async () => {
    const { requests } = openCars(
      [carList(carItem('BMW'), carItem('ノア')), carList(carItem('BMW'))],
      {
        'DELETE /cars/:id': () => new Response(null, { status: 204 }),
      },
    )
    await remove('削除する')

    await waitFor(() => expect(screen.queryByText('ノア')).not.toBeInTheDocument())
    expect(writes(requests).map((r) => [r.method, new URL(r.url).pathname])).toEqual([
      ['DELETE', `/cars/${CAR_IDS.ノア}`],
    ])
  })

  it('[CAR-F-003/AC-2] 終わった予約が1件だけある「ノア」には「削除」が出ず、「使わないにする」が出る', async () => {
    openCars([carList(carItem('ノア', { hasReservations: true }))])

    expect(await screen.findByRole('button', { name: 'ノアを使わないにする' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ノアを削除' })).not.toBeInTheDocument()
  })

  it('[CAR-F-003/AC-5] 確認を開いている間に予約が入っていたら、削除されず「この車には予約があるため削除できません。使わないにしてください。」と出る', async () => {
    openCars([carList(carItem('ノア')), carList(carItem('ノア', { hasReservations: true }))], {
      'DELETE /cars/:id': carError(
        409,
        'in_use',
        'この車には予約があるため削除できません。使わないにしてください。',
      ),
    })
    await remove('削除する')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'この車には予約があるため削除できません。使わないにしてください。',
    )
    expect(await carRow('ノア')).toBeInTheDocument()
  })

  it('[CAR-F-003/AC-6] 「削除」を押し、確認で「キャンセル」を選ぶと、「ノア」は残る', async () => {
    const { requests } = openCars([carList(carItem('ノア'))])
    await remove('キャンセル')

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '「ノア」を削除しますか？' })).toBeNull(),
    )
    expect(writes(requests)).toHaveLength(0)
    expect(await carRow('ノア')).toBeInTheDocument()
  })

  it('[CAR-F-003/AC-7] 確認を開いている間に母が「ノア」を削除していたら「この車は見つかりません。」と出る', async () => {
    openCars([carList(carItem('ノア')), carList()], {
      'DELETE /cars/:id': carError(404, 'not_found', 'この車は見つかりません。'),
    })
    await remove('削除する')

    expect(await screen.findByRole('alert')).toHaveTextContent('この車は見つかりません。')
  })

  // AC ではない確認
  it('「使うに戻す」は確認を出さずに「使う」にする', async () => {
    const { requests } = openCars(
      [carList(carItem('ノア', { isActive: false })), carList(carItem('ノア'))],
      { 'PATCH /cars/:id': () => json({ id: CAR_IDS.ノア, name: 'ノア', isActive: true }) },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'ノアを使うに戻す' }))

    await waitFor(async () =>
      expect(within(await carRow('ノア')).queryByText('使わない')).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await writes(requests)[0]!.clone().json()).toEqual({ isActive: true })
  })
})
