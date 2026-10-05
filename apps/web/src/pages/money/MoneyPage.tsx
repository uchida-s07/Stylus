import type { BillListResponse, BillSummary, PendingSettlement } from '@stylus/shared'
import {
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Container,
  Group,
  Loader,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../api/client'
import { callApi, loadErrorOf } from '../../api/responses'
import { useLeaveAsUnregistered } from '../../auth/unregistered'
import { ErrorScreen, type ErrorKind } from '../../components/ErrorScreen'
import { STATUS_LABELS, dateLabel, direction, yen } from './format'

type View = 'open' | 'closed'
type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BillListResponse }
  | { kind: 'error'; error: ErrorKind }

// お金の画面（MONEY-F-004）：合計、受け取り待ちの精算、請求の一覧（片付いていない／片付いた）
export function MoneyPage() {
  const [view, setView] = useState<View>('open')
  const [state, setState] = useState<State>({ kind: 'loading' })
  const leaveAsUnregistered = useLeaveAsUnregistered()

  useEffect(() => {
    let active = true
    void (async () => {
      const result = await callApi(() => api.bills.$get({ query: { view } }))
      if (!active) return
      if (result.kind === 'unregistered') return void leaveAsUnregistered()
      if (result.kind !== 'ok') return setState({ kind: 'error', error: loadErrorOf(result) })
      setState({ kind: 'ready', data: result.data })
    })()
    return () => {
      active = false
    }
  }, [view, leaveAsUnregistered])

  if (state.kind === 'error') return <ErrorScreen kind={state.error} />
  return (
    <Container component="main" aria-label="お金" py="md">
      <Stack>
        <Group justify="space-between">
          <Title order={1}>お金</Title>
          <Anchor component={Link} to="/">
            ホームへ
          </Anchor>
        </Group>
        <Group grow>
          <Button component={Link} to="/money/bills/new">
            請求する
          </Button>
          <Button component={Link} to="/money/settle" variant="light">
            精算
          </Button>
        </Group>
        {state.kind === 'loading' ? (
          <Center py="xl">
            <Loader aria-label="読み込み中" />
          </Center>
        ) : (
          <>
            <Totals totals={state.data.totals} />
            {state.data.pendingSettlements.map((s) => (
              <PendingSettlementCard key={s.id} settlement={s} />
            ))}
          </>
        )}
        <SegmentedControl
          value={view}
          onChange={(v) => {
            setState({ kind: 'loading' })
            setView(v as View)
          }}
          data={[
            { value: 'open', label: '片付いていない' },
            { value: 'closed', label: '片付いた' },
          ]}
        />
        {state.kind === 'ready' &&
          (state.data.bills.length === 0 ? (
            <Text c="dimmed">請求はありません</Text>
          ) : (
            state.data.bills.map((bill) => <BillRow key={bill.id} bill={bill} />)
          ))}
        <Anchor component={Link} to="/money/categories" ta="center">
          カテゴリー
        </Anchor>
      </Stack>
    </Container>
  )
}

function Totals({ totals }: { totals: BillListResponse['totals'] }) {
  const items: [string, number][] = [
    ['払う額の合計', totals.self.pay],
    ['受け取る額の合計', totals.self.receive],
  ]
  if (totals.household) {
    items.push(
      ['家庭が払う額', totals.household.pay],
      ['家庭が受け取る額', totals.household.receive],
    )
  }
  return (
    <SimpleGrid cols={2}>
      {items.map(([label, amount]) => (
        <Card key={label} withBorder padding="sm">
          <Text size="sm" c="dimmed">
            {label}
          </Text>
          <Text size="xl" fw={700}>
            {yen(amount)}
          </Text>
        </Card>
      ))}
    </SimpleGrid>
  )
}

// 受け取り待ちの精算：受け取る側には「母から 2,500円」、払う側には「せいごへ 2,500円」
function PendingSettlementCard({ settlement: s }: { settlement: PendingSettlement }) {
  const label =
    s.side === 'receiver'
      ? `${s.payer.name}から ${yen(s.amount)}`
      : `${s.receiver.name}へ ${yen(s.amount)}`
  return (
    <Card component={Link} to={`/money/settlements/${s.id}`} withBorder padding="sm" bg="yellow.0">
      <Text fw={700}>{label}</Text>
      <Text size="sm" c="dimmed">
        精算の受け取り待ち
      </Text>
    </Card>
  )
}

function BillRow({ bill }: { bill: BillSummary }) {
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
        <Badge variant="light">{STATUS_LABELS[bill.status]}</Badge>
      </Group>
      <Text size="sm" c="dimmed">
        {dateLabel(bill.occurredOn)}・{bill.category.name}
      </Text>
    </Card>
  )
}
