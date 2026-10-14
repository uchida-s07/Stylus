import { isDateString, toJstDate } from '@stylus/shared'
import {
  ActionIcon,
  Anchor,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Menu,
  Stack,
  Title,
} from '@mantine/core'
import { Link, useSearchParams } from 'react-router'
import { api } from '../../api/client'
import { callApi } from '../../api/responses'
import { ErrorScreen } from '../../components/ErrorScreen'
import { combineResults, useApiLoad } from '../../components/useApiLoad'
import { monthVisibleRange } from './calendarDates'
import { CarCalendar } from './CarCalendar'
import { NoCars } from './NoCars'

// 車の画面（CAR-F-005）：月のカレンダーと、選んだ日の時間割
// 選んだ日は URL の ?date=YYYY-MM-DD（無い・形が違うときは今日）。日を選ぶと置き換える（履歴は積まない）
// 予約は、月のカレンダーに見えている範囲（6週）を1回で引き、選んだ日の時間割も同じ結果から出す
// 履歴と車の管理へは、右上のメニューから進む
export function CarPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const selectedDate = dateParam && isDateString(dateParam) ? dateParam : toJstDate(new Date())
  const range = monthVisibleRange(selectedDate)
  const { state } = useApiLoad(
    async () =>
      combineResults([
        await callApi(() => api.cars.$get()),
        await callApi(() => api['car-reservations'].$get({ query: { view: 'range', ...range } })),
      ]),
    range.from,
  )

  function selectDate(date: string) {
    setSearchParams({ date }, { replace: true })
  }

  if (state.kind === 'error') return <ErrorScreen kind={state.error} />
  return (
    <Container component="main" aria-label="車" py="md">
      <Stack>
        <Group justify="space-between" wrap="nowrap">
          <Title order={1}>車</Title>
          <Group gap="xs" wrap="nowrap">
            <Anchor component={Link} to="/">
              ホームへ
            </Anchor>
            <CarMenu />
          </Group>
        </Group>
        <Button component={Link} to="/car/reservations/new">
          予約する
        </Button>
        {state.kind === 'loading' ? (
          <Center py="xl">
            <Loader aria-label="読み込み中" />
          </Center>
        ) : state.data[0].cars.length === 0 ? (
          <NoCars />
        ) : (
          <CarCalendar
            selectedDate={selectedDate}
            reservations={state.data[1].reservations}
            onSelectDate={selectDate}
          />
        )}
      </Stack>
    </Container>
  )
}

// 右上のメニュー：履歴と車の管理
function CarMenu() {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="subtle" size="lg" aria-label="メニュー">
          ⋯
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={Link} to="/car/history">
          履歴
        </Menu.Item>
        <Menu.Item component={Link} to="/car/cars">
          車の管理
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
