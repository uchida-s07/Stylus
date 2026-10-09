import type {
  BillSummary,
  MemberSummary,
  MeResponse,
  Party,
  SettlementPreview,
} from '@stylus/shared'
import {
  Alert,
  Anchor,
  Button,
  Card,
  Center,
  Container,
  Group,
  List,
  Loader,
  NativeSelect,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../../api/client'
import { callApi, loadErrorOf, WRITE_MESSAGES } from '../../api/responses'
import { useLeaveAsUnregistered } from '../../auth/unregistered'
import { ErrorScreen, type ErrorKind } from '../../components/ErrorScreen'
import { Loading } from '../../components/Loading'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { dateLabel, direction, SETTLEMENT_CHANGED, settlementLabel, yen } from './format'
import { combineResults, useApiLoad } from '../../components/useApiLoad'

type As = 'self' | 'household'
const HOUSEHOLD = 'household'

const LOAD_MESSAGES: Record<ErrorKind, string> = {
  network: '通信できません。電波の良いところでもう一度開いてください。',
  loadFailed: 'うまく読み込めませんでした。時間をおいてもう一度開いてください。',
}

// 精算（MONEY-F-010）：名義（親だけ）と相手を選ぶと、2者の間の請求中の請求と精算額を出す
export function SettlePage() {
  const { state } = useApiLoad(async () =>
    combineResults([await callApi(() => api.me.$get()), await callApi(() => api.members.$get())]),
  )
  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'error') return <ErrorScreen kind={state.error} />
  const [me, { members }] = state.data
  return <SettleView me={me} members={members} />
}

type PreviewState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'ready'; preview: SettlementPreview }
  | { kind: 'error'; error: ErrorKind }

function SettleView({ me, members }: { me: MeResponse; members: MemberSummary[] }) {
  const [as, setAs] = useState<As>('self')
  const [counterpart, setCounterpart] = useState('')
  const [preview, setPreview] = useState<PreviewState>({ kind: 'none' })
  const [round, setRound] = useState(0)
  const [notice, setNotice] = useState<string>()
  const [confirming, setConfirming] = useState(false)
  const leaveAsUnregistered = useLeaveAsUnregistered()
  const navigate = useNavigate()

  useEffect(() => {
    if (!counterpart) return
    let active = true
    void (async () => {
      const result = await callApi(() =>
        api.settlements.preview.$get({ query: { as, counterpart } }),
      )
      if (!active) return
      if (result.kind === 'unregistered') return void leaveAsUnregistered()
      if (result.kind !== 'ok') return setPreview({ kind: 'error', error: loadErrorOf(result) })
      setPreview({ kind: 'ready', preview: result.data })
    })()
    return () => {
      active = false
    }
  }, [as, counterpart, round, leaveAsUnregistered])

  const options = counterpartOptions(me, members, as)

  function choose(next: { as?: As; counterpart?: string }) {
    const nextAs = next.as ?? as
    let nextCounterpart = next.counterpart ?? counterpart
    if (!counterpartOptions(me, members, nextAs).some((o) => o.value === nextCounterpart)) {
      nextCounterpart = ''
    }
    setAs(nextAs)
    setCounterpart(nextCounterpart)
    setPreview(nextCounterpart ? { kind: 'loading' } : { kind: 'none' })
    setNotice(undefined)
  }

  // まとめて払った（MONEY-F-011）：見ていた請求の ID と版、精算額、払う側を送る（tasks.md D-3）
  // 成功したら精算の中身へ進む（D-4）。409 なら精算額を取り直して知らせる
  async function payAll(p: SettlementPreview) {
    const result = await callApi(() =>
      api.settlements.$post({
        json: {
          as,
          counterpart,
          bills: p.bills.map((b) => ({ id: b.id, version: b.version })),
          amount: p.amount,
          // 差し引き 0円 なら押した側が払う側
          payer: p.payer ?? 'self',
        },
      }),
    )
    setConfirming(false)
    if (result.kind === 'ok') return void navigate(`/money/settlements/${result.data.id}`)
    if (result.kind === 'unregistered') return void (await leaveAsUnregistered())
    if (result.kind === 'network') return setNotice(WRITE_MESSAGES.network)
    if (result.status === 409) {
      setNotice(SETTLEMENT_CHANGED)
      setRound((r) => r + 1)
      return
    }
    setNotice(WRITE_MESSAGES.failed)
  }

  return (
    <Container component="main" aria-label="精算" py="md" size="xs">
      <Stack>
        <Group justify="space-between">
          <Title order={1}>精算</Title>
          <Anchor component={Link} to="/money">
            お金へ
          </Anchor>
        </Group>
        {me.isParent && (
          <Stack gap={4}>
            <Text size="sm" fw={500} id="settle-as-label">
              名義
            </Text>
            <SegmentedControl
              aria-labelledby="settle-as-label"
              value={as}
              onChange={(v) => choose({ as: v as As })}
              data={[
                { value: 'self', label: '自分' },
                { value: 'household', label: '家庭' },
              ]}
            />
          </Stack>
        )}
        <NativeSelect
          label="相手"
          value={counterpart}
          onChange={(e) => choose({ counterpart: e.currentTarget.value })}
          data={[{ value: '', label: '選んでください' }, ...options]}
        />
        {preview.kind === 'loading' && (
          <Center py="xl">
            <Loader aria-label="読み込み中" />
          </Center>
        )}
        {preview.kind === 'error' && <Alert color="red">{LOAD_MESSAGES[preview.error]}</Alert>}
        {notice && <Alert color="red">{notice}</Alert>}
        {preview.kind === 'ready' && (
          <PreviewView preview={preview.preview} onPay={() => setConfirming(true)} />
        )}
      </Stack>
      {confirming && preview.kind === 'ready' && (
        <ConfirmDialog
          opened
          title={`${payLabel(preview.preview)} 払ったことにしますか？`}
          confirmLabel="払った"
          onClose={() => setConfirming(false)}
          onConfirm={() => payAll(preview.preview)}
        />
      )}
    </Container>
  )
}

// 「母がせいごに 2,500円」。差し引き 0円 なら押した側（名義の側）が払う側
function payLabel(p: SettlementPreview) {
  return p.payer === 'counterpart'
    ? settlementLabel(p.counterpart, p.self, p.amount)
    : settlementLabel(p.self, p.counterpart, p.amount)
}

function PreviewView({ preview: p, onPay }: { preview: SettlementPreview; onPay: () => void }) {
  if (p.bills.length === 0) return <Text>精算する請求はありません</Text>
  const selfBills = p.bills.filter((b) => b.from.memberId === p.self.memberId)
  const counterpartBills = p.bills.filter((b) => b.from.memberId !== p.self.memberId)
  return (
    <Stack>
      <DirectionGroup
        from={p.self}
        to={p.counterpart}
        bills={selfBills}
        total={p.selfRequestedTotal}
      />
      <DirectionGroup
        from={p.counterpart}
        to={p.self}
        bills={counterpartBills}
        total={p.counterpartRequestedTotal}
      />
      <Card withBorder bg="blue.0">
        <Text fw={700} size="lg" ta="center">
          {p.payer === null
            ? '差し引き 0円（お金のやり取りはありません）'
            : p.payer === 'self'
              ? settlementLabel(p.self, p.counterpart, p.amount)
              : settlementLabel(p.counterpart, p.self, p.amount)}
        </Text>
      </Card>
      {/* 払う側（0円ならどちらも）だけが押せる。受け取る側には出さない */}
      {p.payer !== 'counterpart' && <Button onClick={onPay}>まとめて払った</Button>}
    </Stack>
  )
}

// 向きごとの請求と小計
function DirectionGroup({
  from,
  to,
  bills,
  total,
}: {
  from: Party
  to: Party
  bills: BillSummary[]
  total: number
}) {
  return (
    <section>
      <Group justify="space-between">
        <Text fw={700}>{direction(from, to)}</Text>
        <Text fw={700}>{yen(total)}</Text>
      </Group>
      <List size="sm" spacing={2}>
        {bills.map((b) => (
          <List.Item key={b.id}>
            {b.title} {yen(b.amount)}（{dateLabel(b.occurredOn)}）
          </List.Item>
        ))}
      </List>
    </section>
  )
}

// 相手の選択肢：「家庭」の名義なら息子だけ。自分の名義なら自分以外の家族と、息子なら「家庭」
function counterpartOptions(me: MeResponse, members: MemberSummary[], as: As) {
  if (as === 'household') {
    return members.filter((m) => !m.isParent).map((m) => ({ value: m.id, label: m.displayName }))
  }
  const others = members
    .filter((m) => m.id !== me.id)
    .map((m) => ({ value: m.id, label: m.displayName }))
  return me.isParent ? others : [...others, { value: HOUSEHOLD, label: '家庭' }]
}
