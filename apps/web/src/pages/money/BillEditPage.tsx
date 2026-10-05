import { availableBillActions, createBillEditSchema, toJstDate } from '@stylus/shared'
import { Anchor, Container, Group, Stack, Title } from '@mantine/core'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../../api/client'
import { callApi, WRITE_MESSAGES } from '../../api/responses'
import { useLeaveAsUnregistered } from '../../auth/unregistered'
import { ErrorScreen } from '../../components/ErrorScreen'
import { Loading } from '../../components/Loading'
import { BillForm } from './BillForm'
import { fieldErrorsOf, formToInput, type BillFormValues, type SendResult } from './billFormValues'
import { BILL_CHANGED } from './format'
import { NoticeScreen } from './NoticeScreen'
import { combineResults, useApiLoad } from './useApiLoad'

// 請求を直す・出し直す（MONEY-F-002）。請求する側・請求先は直せない
export function BillEditPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const leaveAsUnregistered = useLeaveAsUnregistered()
  const { state } = useApiLoad(async () =>
    combineResults([
      await callApi(() => api.bills[':id'].$get({ param: { id } })),
      await callApi(() => api.me.$get()),
      await callApi(() => api.members.$get()),
      await callApi(() => api['bill-categories'].$get()),
    ]),
  )

  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'error') {
    if (state.code === 'not_found') {
      return <NoticeScreen title="請求を直す" message="この請求は見つかりません。" />
    }
    return <ErrorScreen kind={state.error} />
  }
  const [bill, me, { members }, { categories }] = state.data
  if (!availableBillActions(bill.status, bill.settlementId !== null, bill.sides).includes('edit')) {
    return <NoticeScreen title="請求を直す" message={BILL_CHANGED.state} />
  }

  async function send(values: BillFormValues): Promise<SendResult> {
    const parsed = createBillEditSchema(toJstDate(new Date())).safeParse({
      ...formToInput(values),
      version: bill.version,
    })
    if (!parsed.success) return { kind: 'fieldErrors', errors: fieldErrorsOf(parsed.error) }

    const result = await callApi(() =>
      api.bills[':id'].$patch({ param: { id: bill.id }, json: parsed.data }),
    )
    if (result.kind === 'ok') {
      void navigate(`/money/bills/${bill.id}`)
      return { kind: 'ok' }
    }
    if (result.kind === 'unregistered') {
      await leaveAsUnregistered()
      return { kind: 'ok' }
    }
    if (result.kind === 'network') return { kind: 'notice', message: WRITE_MESSAGES.network }
    const { error } = result
    if (error?.code === 'invalid_input' && error.fields) {
      return { kind: 'fieldErrors', errors: error.fields }
    }
    if (result.status === 409) {
      // 状態が同じなら中身が変わった、違えば状態が変わった
      const latest = await callApi(() => api.bills[':id'].$get({ param: { id: bill.id } }))
      const same = latest.kind === 'ok' && latest.data.status === bill.status
      return { kind: 'notice', message: same ? BILL_CHANGED.content : BILL_CHANGED.state }
    }
    return { kind: 'notice', message: WRITE_MESSAGES.failed }
  }

  return (
    <Container component="main" aria-label="請求を直す" py="md" size="xs">
      <Stack>
        <Group justify="space-between">
          <Title order={1}>請求を直す</Title>
          <Anchor component={Link} to={`/money/bills/${bill.id}`}>
            戻る
          </Anchor>
        </Group>
        <BillForm
          initial={{
            as: bill.from.memberId === null ? 'household' : 'self',
            to: bill.to.memberId ?? 'household',
            amount: String(bill.amount),
            categoryId: bill.category.id,
            title: bill.title,
            memo: bill.memo ?? '',
            occurredOn: bill.occurredOn,
          }}
          me={me}
          members={members}
          categories={categories}
          partiesEditable={false}
          submitLabel={bill.status === 'returned' ? '出し直す' : '保存する'}
          send={send}
        />
      </Stack>
    </Container>
  )
}
