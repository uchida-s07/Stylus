import { formatJstDate, toJstDate, type Reservation } from '@stylus/shared'
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
  Text,
  Title,
} from '@mantine/core'
import { Link } from 'react-router'
import { api } from '../../api/client'
import { callApi } from '../../api/responses'
import { ErrorScreen } from '../../components/ErrorScreen'
import { combineResults, useApiLoad } from '../../components/useApiLoad'
import { ReservationRow } from './ReservationRow'

// 車の画面（CAR-F-005）：これからの予約（使用中を含む）を、開始の日付（日本時間）ごとに出す
// 履歴と車の管理へは、右上のメニューから進む
export function CarPage() {
  const { state } = useApiLoad(async () =>
    combineResults([
      await callApi(() => api.cars.$get()),
      await callApi(() => api['car-reservations'].$get({ query: { view: 'upcoming' } })),
    ]),
  )

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
          <Upcoming reservations={state.data[1].reservations} />
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

// 車が1台も無い（CAR-F-005/AC-8）
export function NoCars({ message = '車が登録されていません' }: { message?: string }) {
  return (
    <Stack gap="xs">
      <Text>{message}</Text>
      <Anchor component={Link} to="/car/cars">
        車の管理へ
      </Anchor>
    </Stack>
  )
}

// これからの予約を開始の日付ごとに（API が開始の早い順に返す）
function Upcoming({ reservations }: { reservations: Reservation[] }) {
  if (reservations.length === 0) return <Text c="dimmed">これからの予約はありません</Text>
  const days: { date: string; heading: string; items: Reservation[] }[] = []
  for (const r of reservations) {
    const date = toJstDate(new Date(r.startsAt))
    const last = days.at(-1)
    if (last?.date === date) last.items.push(r)
    else days.push({ date, heading: formatJstDate(r.startsAt), items: [r] })
  }
  return days.map((day) => (
    <Stack key={day.date} component="section" aria-label={day.heading} gap="xs">
      <Title order={2} size="h4">
        {day.heading}
      </Title>
      {day.items.map((r) => (
        <ReservationRow key={r.id} reservation={r} />
      ))}
    </Stack>
  ))
}
