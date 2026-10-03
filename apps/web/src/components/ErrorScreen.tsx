import { Alert, Container, Stack, Title } from '@mantine/core'

// 通信できない・読み込めないときの表示（AUTH-F-003、APP-F-001）。端末のログイン状態は消さない
export type ErrorKind = 'network' | 'loadFailed'

const ERROR_MESSAGES: Record<ErrorKind, string> = {
  network: '通信できません。電波の良いところでもう一度開いてください。',
  loadFailed: 'うまく読み込めませんでした。時間をおいてもう一度開いてください。',
}

export function ErrorScreen({ kind }: { kind: ErrorKind }) {
  return (
    <Container component="main" aria-label="エラー" size="xs" py="xl">
      <Stack>
        <Title order={1}>Stylus</Title>
        <Alert color="red">{ERROR_MESSAGES[kind]}</Alert>
      </Stack>
    </Container>
  )
}
