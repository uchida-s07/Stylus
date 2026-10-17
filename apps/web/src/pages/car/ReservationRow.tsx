import { reservationPhase, type Reservation } from '@stylus/shared'
import { Badge, Card, Group, Text } from '@mantine/core'
import { Link } from 'react-router'
import { periodLabel } from './format'

// 履歴の予約の1行。押すと予約の中身へ。開始の日付をいつも添える
// 「使用中」の印は端末の時計で決める（見た目だけ。判定は API が行う）
export function ReservationRow({ reservation: r }: { reservation: Reservation }) {
  const inUse = reservationPhase(r.startsAt, r.endsAt, new Date()) === 'in_use'
  return (
    <Card component={Link} to={`/car/reservations/${r.id}`} withBorder padding="sm">
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Text fw={700} truncate>
            {r.car.name}
          </Text>
          {!r.car.isActive && (
            <Badge variant="light" color="gray">
              使わない
            </Badge>
          )}
          <Text>{r.member.displayName}</Text>
        </Group>
        {inUse && (
          <Badge variant="filled" color="orange">
            使用中
          </Badge>
        )}
      </Group>
      <Text size="sm">{periodLabel(r.startsAt, r.endsAt)}</Text>
      {r.destination && (
        <Text size="sm" c="dimmed" truncate>
          {r.destination}
        </Text>
      )}
    </Card>
  )
}
