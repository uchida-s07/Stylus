import {
  availableSettlementActions,
  type SettlementAction,
  type SettlementDetail,
} from '@stylus/shared'
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Container,
  Group,
  List,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../../api/client'
import { callApi, WRITE_MESSAGES } from '../../api/responses'
import { useLeaveAsUnregistered } from '../../auth/unregistered'
import { ErrorScreen } from '../../components/ErrorScreen'
import { Loading } from '../../components/Loading'
import { ConfirmDialog } from './ConfirmDialog'
import { NoticeScreen } from './NoticeScreen'
import {
  dateLabel,
  dateTimeLabel,
  direction,
  SETTLEMENT_CHANGED,
  SETTLEMENT_STATUS_COLORS,
  SETTLEMENT_STATUS_LABELS,
  settlementLabel,
  STATUS_LABELS,
  yen,
} from './format'
import { useApiLoad } from './useApiLoad'

type Ui = { label: string; title: string; confirm: string }

// 受け取る側：「まとめて受け取った」「受け取っていない」、払う側：「払ったを取り消す」（MONEY-F-009・012）
function actionUi(action: SettlementAction, s: SettlementDetail): Ui {
  if (action === 'confirm') {
    return {
      label: 'まとめて受け取った',
      title: `${yen(s.amount)}を受け取ったことにしますか？`,
      confirm: '受け取った',
    }
  }
  return s.sides.includes('receiver')
    ? {
        label: '受け取っていない',
        title: '受け取っていないことにしますか？',
        confirm: '受け取っていない',
      }
    : {
        label: '払ったを取り消す',
        title: '「払った」を取り消しますか？',
        confirm: '払ったを取り消す',
      }
}

// 精算の中身（MONEY-F-012）
export function SettlementDetailPage() {
  const { id = '' } = useParams()
  const { state } = useApiLoad(() => callApi(() => api.settlements[':id'].$get({ param: { id } })))

  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'error') {
    if (state.code === 'not_found') {
      return <NoticeScreen title="精算の中身" message="この精算は見つかりません。" />
    }
    return <ErrorScreen kind={state.error} />
  }
  return <SettlementView initial={state.data} />
}

function SettlementView({ initial }: { initial: SettlementDetail }) {
  const [settlement, setSettlement] = useState(initial)
  const [notice, setNotice] = useState<string>()
  const [confirming, setConfirming] = useState<SettlementAction>()
  const leaveAsUnregistered = useLeaveAsUnregistered()
  // 受け取る側の操作（受け取った・受け取っていない）を先に並べる
  const actions = availableSettlementActions(settlement.status, settlement.sides)

  async function run(action: SettlementAction) {
    const route = api.settlements[':id']
    const args = { param: { id: settlement.id } }
    const result = await callApi(() =>
      action === 'confirm' ? route.confirm.$post(args) : route.revert.$post(args),
    )
    setConfirming(undefined)
    if (result.kind === 'ok') {
      setSettlement(result.data)
      setNotice(undefined)
      return
    }
    if (result.kind === 'unregistered') return void (await leaveAsUnregistered())
    if (result.kind === 'network') return setNotice(WRITE_MESSAGES.network)
    if (result.status === 409) {
      setNotice(SETTLEMENT_CHANGED)
      const latest = await callApi(() => route.$get(args))
      if (latest.kind === 'ok') setSettlement(latest.data)
      return
    }
    setNotice(WRITE_MESSAGES.failed)
  }

  return (
    <Container component="main" aria-label="精算の中身" py="md" size="xs">
      <Stack>
        <Group justify="space-between">
          <Title order={1}>精算の中身</Title>
          <Anchor component={Link} to="/money">
            お金へ
          </Anchor>
        </Group>
        {notice && <Alert color="red">{notice}</Alert>}
        <Card withBorder>
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap">
              <Text fw={700} size="lg">
                {settlementLabel(settlement.payer, settlement.receiver, settlement.amount)}
              </Text>
              <Badge variant="light" color={SETTLEMENT_STATUS_COLORS[settlement.status]}>
                {SETTLEMENT_STATUS_LABELS[settlement.status]}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              払った：{settlement.paidByName}（{dateTimeLabel(settlement.paidAt)}）
            </Text>
            {settlement.confirmedByName && settlement.confirmedAt && (
              <Text size="sm" c="dimmed">
                受け取った：{settlement.confirmedByName}（{dateTimeLabel(settlement.confirmedAt)}）
              </Text>
            )}
            {settlement.revertedByName && settlement.revertedAt && (
              <Text size="sm" c="dimmed">
                戻した：{settlement.revertedByName}（{dateTimeLabel(settlement.revertedAt)}）
              </Text>
            )}
          </Stack>
        </Card>
        {actions.map((action) => (
          <Button
            key={action}
            variant={action === 'confirm' ? 'filled' : 'outline'}
            onClick={() => setConfirming(action)}
          >
            {actionUi(action, settlement).label}
          </Button>
        ))}
        <Title order={2} size="h4">
          含まれる請求
        </Title>
        <List spacing="xs">
          {settlement.bills.map((b) => (
            <List.Item key={b.id}>
              <Anchor component={Link} to={`/money/bills/${b.id}`}>
                {b.title} {yen(b.amount)}
              </Anchor>
              <Text size="sm" c="dimmed">
                {direction(b.from, b.to)}・{dateLabel(b.occurredOn)}・{STATUS_LABELS[b.status]}
              </Text>
            </List.Item>
          ))}
        </List>
      </Stack>
      {confirming && (
        <ConfirmDialog
          opened
          title={actionUi(confirming, settlement).title}
          confirmLabel={actionUi(confirming, settlement).confirm}
          onClose={() => setConfirming(undefined)}
          onConfirm={() => run(confirming)}
        />
      )}
    </Container>
  )
}
