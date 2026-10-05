import type { BillSummary } from '@stylus/shared'
import { Badge, Card, Group, Text } from '@mantine/core'
import { Link } from 'react-router'
import { STATUS_COLORS, STATUS_LABELS, dateLabel, direction, yen } from './format'

// 請求の一覧の1行（お金の画面・履歴）。押すと請求の中身へ
export function BillRow({ bill }: { bill: BillSummary }) {
  return (
    <Card component={Link} to={`/money/bills/${bill.id}`} withBorder padding="sm">
      <Group justify="space-between" wrap="nowrap">
        <Text fw={700} truncate>
          {bill.title}
        </Text>
        <Text fw={700}>{yen(bill.amount)}</Text>
      </Group>
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm">{direction(bill.from, bill.to)}</Text>
        <Badge variant="light" color={STATUS_COLORS[bill.status]}>
          {STATUS_LABELS[bill.status]}
        </Badge>
      </Group>
      <Text size="sm" c="dimmed">
        {dateLabel(bill.occurredOn)}・{bill.category.name}
      </Text>
    </Card>
  )
}
