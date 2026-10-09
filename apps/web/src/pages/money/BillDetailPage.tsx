import { availableBillActions, type BillAction, type BillDetail } from '@stylus/shared'
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
import { callApi, WRITE_MESSAGES, type ApiResult } from '../../api/responses'
import { useLeaveAsUnregistered } from '../../auth/unregistered'
import { ErrorScreen } from '../../components/ErrorScreen'
import { Loading } from '../../components/Loading'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { NoticeScreen } from '../../components/NoticeScreen'
import { ReturnDialog } from './ReturnDialog'
import {
  BILL_CHANGED,
  EVENT_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  dateLabel,
  dateTimeLabel,
  direction,
  settlementLabel,
  yen,
} from './format'
import { useApiLoad } from '../../components/useApiLoad'

// 確認の画面で行う操作（直す・差し戻すは別の画面・入力で行う）
type ConfirmAction = Exclude<BillAction, 'edit' | 'return'>

type ActionUi = { label: string; title: string; confirm: string; color?: string }

function actionUi(action: ConfirmAction, bill: BillDetail): ActionUi {
  switch (action) {
    case 'cancel':
      return {
        label: '取り消す',
        title: 'この請求を取り消しますか？',
        confirm: '取り消す',
        color: 'red',
      }
    case 'pay':
      return {
        label: '払った',
        title: `${yen(bill.amount)}を払ったことにしますか？`,
        confirm: '払った',
      }
    case 'confirm':
      return {
        label: '受け取った',
        title: `${yen(bill.amount)}を受け取ったことにしますか？`,
        confirm: '受け取った',
      }
    case 'revert':
      // 請求先側は「払った」の取り消し、請求する側は「受け取っていない」（MONEY-F-009）
      return bill.sides.includes('to')
        ? {
            label: '払ったを取り消す',
            title: '「払った」を取り消しますか？',
            confirm: '払ったを取り消す',
          }
        : {
            label: '受け取っていない',
            title: '受け取っていないことにしますか？',
            confirm: '受け取っていない',
          }
  }
}

function postAction(action: ConfirmAction, id: string, version: number) {
  const route = api.bills[':id']
  const args = { param: { id }, json: { version } }
  switch (action) {
    case 'cancel':
      return route.cancel.$post(args)
    case 'pay':
      return route.pay.$post(args)
    case 'confirm':
      return route.confirm.$post(args)
    case 'revert':
      return route.revert.$post(args)
  }
}

// 請求の中身と経過、状態と側に応じた操作のボタン（MONEY-F-003・005〜009）
export function BillDetailPage() {
  const { id = '' } = useParams()
  const { state } = useApiLoad(() => callApi(() => api.bills[':id'].$get({ param: { id } })))

  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'error') {
    if (state.code === 'not_found') {
      return (
        <NoticeScreen
          backTo="/money"
          backLabel="お金へ"
          title="請求"
          message="この請求は見つかりません。"
        />
      )
    }
    return <ErrorScreen kind={state.error} />
  }
  return <BillDetailView key={state.data.version} initial={state.data} />
}

function BillDetailView({ initial }: { initial: BillDetail }) {
  const [bill, setBill] = useState(initial)
  const [notice, setNotice] = useState<string>()
  const [confirming, setConfirming] = useState<ConfirmAction>()
  const [returning, setReturning] = useState(false)
  const leaveAsUnregistered = useLeaveAsUnregistered()

  const inSettlement = bill.settlementId !== null
  const actions = availableBillActions(bill.status, inSettlement, bill.sides)
  const confirmActions = actions.filter((a): a is ConfirmAction => a !== 'edit' && a !== 'return')

  // 操作の結果を画面に反映する。409 なら取り直して、状態が同じなら「中身が変わりました」、違えば「状態が変わりました」
  // 戻り値は、画面が最新になったか（成功・409）。書き込みに失敗したときは false
  async function apply(result: ApiResult<BillDetail>): Promise<boolean> {
    if (result.kind === 'ok') {
      setBill(result.data)
      setNotice(undefined)
      return true
    }
    if (result.kind === 'unregistered') {
      await leaveAsUnregistered()
      return true
    }
    if (result.kind === 'network') {
      setNotice(WRITE_MESSAGES.network)
      return false
    }
    if (result.status === 409) {
      const latest = await callApi(() => api.bills[':id'].$get({ param: { id: bill.id } }))
      if (latest.kind === 'ok') {
        setNotice(latest.data.status === bill.status ? BILL_CHANGED.content : BILL_CHANGED.state)
        setBill(latest.data)
      } else {
        setNotice(BILL_CHANGED.state)
      }
      return true
    }
    setNotice(WRITE_MESSAGES.failed)
    return false
  }

  async function run(action: ConfirmAction) {
    await apply(await callApi(() => postAction(action, bill.id, bill.version)))
    setConfirming(undefined)
  }

  // 差し戻す：保存できなかったときは理由の入力を残す（閉じない）
  async function giveBack(reason: string) {
    const result = await callApi(() =>
      api.bills[':id'].return.$post({
        param: { id: bill.id },
        json: { version: bill.version, reason },
      }),
    )
    if (await apply(result)) setReturning(false)
  }

  return (
    <Container component="main" aria-label="請求" py="md" size="xs">
      <Stack>
        <Group justify="space-between">
          <Title order={1}>請求</Title>
          <Anchor component={Link} to="/money">
            お金へ
          </Anchor>
        </Group>
        {notice && <Alert color="red">{notice}</Alert>}
        <Card withBorder>
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap">
              <Text fw={700} size="lg">
                {bill.title}
              </Text>
              <Badge variant="light" color={STATUS_COLORS[bill.status]}>
                {STATUS_LABELS[bill.status]}
              </Badge>
            </Group>
            <Text size="xl" fw={700}>
              {yen(bill.amount)}
            </Text>
            <Text>{direction(bill.from, bill.to)}</Text>
            <Text size="sm" c="dimmed">
              {dateLabel(bill.occurredOn)}・{bill.category.name}
            </Text>
            {bill.memo !== null && (
              <div>
                <Text size="sm" c="dimmed">
                  メモ
                </Text>
                <Text style={{ whiteSpace: 'pre-wrap' }}>{bill.memo}</Text>
              </div>
            )}
          </Stack>
        </Card>

        {actions.includes('edit') && (
          <Button component={Link} to={`/money/bills/${bill.id}/edit`} variant="light">
            {bill.status === 'returned' ? '直して出し直す' : '直す'}
          </Button>
        )}
        {confirmActions.map((action) => {
          const ui = actionUi(action, bill)
          return (
            <Button
              key={action}
              variant={action === 'cancel' ? 'outline' : 'filled'}
              color={ui.color}
              onClick={() => setConfirming(action)}
            >
              {ui.label}
            </Button>
          )
        })}
        {actions.includes('return') && (
          <Button
            variant="outline"
            onClick={() => {
              setNotice(undefined)
              setReturning(true)
            }}
          >
            差し戻す
          </Button>
        )}
        {inSettlement && (
          <Button component={Link} to={`/money/settlements/${bill.settlementId}`} variant="light">
            精算の中身を見る
          </Button>
        )}

        <Title order={2} size="h4">
          経過
        </Title>
        <List spacing="xs">
          {bill.events.map((e, i) => (
            <List.Item key={i}>
              <Text>
                {EVENT_LABELS[e.kind]}（{e.actorName}）{e.reason !== null && `：${e.reason}`}
              </Text>
              {e.settlement && (
                <Text size="sm">
                  精算：
                  {settlementLabel(e.settlement.payer, e.settlement.receiver, e.settlement.amount)}
                </Text>
              )}
              <Text size="sm" c="dimmed">
                {dateTimeLabel(e.createdAt)}
              </Text>
            </List.Item>
          ))}
        </List>
      </Stack>
      {returning && (
        <ReturnDialog
          version={bill.version}
          notice={notice}
          onClose={() => setReturning(false)}
          onSubmit={giveBack}
        />
      )}
      {confirming && (
        <ConfirmDialog
          opened
          title={actionUi(confirming, bill).title}
          confirmLabel={actionUi(confirming, bill).confirm}
          color={actionUi(confirming, bill).color}
          onClose={() => setConfirming(undefined)}
          onConfirm={() => run(confirming)}
        />
      )}
    </Container>
  )
}
