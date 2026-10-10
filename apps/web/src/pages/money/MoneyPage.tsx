import type { BillSummary, BillListResponse, MeResponse, PendingSettlement } from '@stylus/shared'
import {
  ActionIcon,
  Anchor,
  Button,
  Card,
  Center,
  Container,
  Group,
  Loader,
  Menu,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core'
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../api/client'
import { callApi } from '../../api/responses'
import { ErrorScreen } from '../../components/ErrorScreen'
import { BillRow } from './BillRow'
import { yen } from './format'
import { combineResults, useApiLoad } from '../../components/useApiLoad'

type Tab = 'pay' | 'receive'
// 選んだタブを、その端末に覚えておくキー
const TAB_KEY = 'stylus.money.billTab'

function loadTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === 'receive' ? 'receive' : 'pay'
  } catch {
    return 'pay'
  }
}

function saveTab(tab: Tab) {
  try {
    localStorage.setItem(TAB_KEY, tab)
  } catch {
    // 覚えられなくても画面は動く
  }
}

// 自分が請求する側なら「受け取り」、請求先側なら「支払い」（「家庭」は親なら関係者。見た目のためだけの判定）
function tabOf(bill: BillSummary, me: MeResponse): Tab {
  const isMine = (memberId: string | null) => (memberId === null ? me.isParent : memberId === me.id)
  return isMine(bill.from.memberId) ? 'receive' : 'pay'
}

// お金の画面（MONEY-F-004）：合計、受け取り待ちの精算、片付いていない請求の一覧（「支払い」「受け取り」のタブ）
// 片付いた請求（履歴）とカテゴリーの編集へは、右上のメニューから進む（2026-10-05 オーナー決定）
export function MoneyPage() {
  const [tab, setTab] = useState<Tab>(loadTab)
  const { state } = useApiLoad(async () =>
    combineResults([
      await callApi(() => api.me.$get()),
      await callApi(() => api.bills.$get({ query: { view: 'open' } })),
    ]),
  )

  if (state.kind === 'error') return <ErrorScreen kind={state.error} />
  return (
    <Container component="main" aria-label="お金" py="md">
      <Stack>
        <Group justify="space-between" wrap="nowrap">
          <Title order={1}>お金</Title>
          <Group gap="xs" wrap="nowrap">
            <Anchor component={Link} to="/">
              ホームへ
            </Anchor>
            <MoneyMenu />
          </Group>
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
            <Totals totals={state.data[1].totals} />
            {state.data[1].pendingSettlements.map((s) => (
              <PendingSettlementCard key={s.id} settlement={s} />
            ))}
            <Tabs
              value={tab}
              onChange={(value) => {
                const next: Tab = value === 'receive' ? 'receive' : 'pay'
                setTab(next)
                saveTab(next)
              }}
            >
              <Tabs.List grow>
                <Tabs.Tab value="pay">支払い</Tabs.Tab>
                <Tabs.Tab value="receive">受け取り</Tabs.Tab>
              </Tabs.List>
            </Tabs>
            <BillList bills={state.data[1].bills.filter((b) => tabOf(b, state.data[0]) === tab)} />
          </>
        )}
      </Stack>
    </Container>
  )
}

// 右上のメニュー：履歴（片付いた請求）とカテゴリーの編集
function MoneyMenu() {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="subtle" size="lg" aria-label="メニュー">
          ⋯
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={Link} to="/money/history">
          履歴
        </Menu.Item>
        <Menu.Item component={Link} to="/money/categories">
          カテゴリーの編集
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
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

function BillList({ bills }: { bills: BillSummary[] }) {
  if (bills.length === 0) return <Text c="dimmed">請求はありません</Text>
  return bills.map((bill) => <BillRow key={bill.id} bill={bill} />)
}
