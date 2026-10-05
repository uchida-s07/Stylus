import { createBillInputSchema, toJstDate } from '@stylus/shared'
import { Anchor, Button, Container, Group, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../../api/client'
import { callApi, WRITE_MESSAGES } from '../../api/responses'
import { useLeaveAsUnregistered } from '../../auth/unregistered'
import { ErrorScreen } from '../../components/ErrorScreen'
import { Loading } from '../../components/Loading'
import { BillForm } from './BillForm'
import { fieldErrorsOf, formToInput, type BillFormValues, type SendResult } from './billFormValues'
import { combineResults, useApiLoad } from './useApiLoad'

// 請求の入力（MONEY-F-001）
export function BillNewPage() {
  const navigate = useNavigate()
  const leaveAsUnregistered = useLeaveAsUnregistered()
  // 入力を開いたときに作り、送り直しでも同じ値を送る（二重登録の防止）
  const [requestId] = useState(() => crypto.randomUUID())
  const { state } = useApiLoad(async () =>
    combineResults([
      await callApi(() => api.me.$get()),
      await callApi(() => api.members.$get()),
      await callApi(() => api['bill-categories'].$get()),
    ]),
  )

  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'error') return <ErrorScreen kind={state.error} />
  const [me, { members }, { categories }] = state.data

  async function send(values: BillFormValues): Promise<SendResult> {
    const parsed = createBillInputSchema(toJstDate(new Date())).safeParse({
      ...formToInput(values),
      as: values.as,
      to: values.to || undefined,
      requestId,
    })
    if (!parsed.success) return { kind: 'fieldErrors', errors: fieldErrorsOf(parsed.error) }

    const result = await callApi(() => api.bills.$post({ json: parsed.data }))
    if (result.kind === 'ok') {
      void navigate('/money')
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
    if (error?.code === 'already_registered') return { kind: 'notice', message: error.message }
    return { kind: 'notice', message: WRITE_MESSAGES.failed }
  }

  return (
    <Container component="main" aria-label="請求する" py="md" size="xs">
      <Stack>
        <Group justify="space-between">
          <Title order={1}>請求する</Title>
          <Anchor component={Link} to="/money">
            お金へ
          </Anchor>
        </Group>
        {categories.length === 0 ? (
          <Stack>
            <Text>先にカテゴリーを追加してください</Text>
            <Button component={Link} to="/money/categories">
              カテゴリーを追加する
            </Button>
          </Stack>
        ) : (
          <BillForm
            initial={{
              as: 'self',
              to: '',
              amount: '',
              categoryId: '',
              title: '',
              memo: '',
              occurredOn: toJstDate(new Date()),
            }}
            me={me}
            members={members}
            categories={categories}
            partiesEditable
            submitLabel="請求する"
            send={send}
          />
        )}
      </Stack>
    </Container>
  )
}
