import { Anchor, Container, Group, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router'
import { api } from '../../api/client'
import { callApi } from '../../api/responses'
import { ErrorScreen } from '../../components/ErrorScreen'
import { Loading } from '../../components/Loading'
import { BillRow } from './BillRow'
import { useApiLoad } from '../../components/useApiLoad'

// 履歴（MONEY-F-004）：片付いた請求（確認済・取消）を、発生日の新しい順に出す
export function HistoryPage() {
  const { state } = useApiLoad(() => callApi(() => api.bills.$get({ query: { view: 'closed' } })))

  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'error') return <ErrorScreen kind={state.error} />
  return (
    <Container component="main" aria-label="履歴" py="md">
      <Stack>
        <Group justify="space-between">
          <Title order={1}>履歴</Title>
          <Anchor component={Link} to="/money">
            お金へ
          </Anchor>
        </Group>
        {state.data.bills.length === 0 ? (
          <Text c="dimmed">片付いた請求はありません</Text>
        ) : (
          state.data.bills.map((bill) => <BillRow key={bill.id} bill={bill} />)
        )}
      </Stack>
    </Container>
  )
}
