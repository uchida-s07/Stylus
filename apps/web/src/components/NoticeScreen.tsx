import { Alert, Anchor, Container, Stack, Title } from '@mantine/core'
import { Link } from 'react-router'

// 開いた記録が見つからないときなど、知らせだけを出す画面。backTo・backLabel は戻り先（「お金へ」と /money など）
export function NoticeScreen({
  title,
  message,
  backTo,
  backLabel,
}: {
  title: string
  message: string
  backTo: string
  backLabel: string
}) {
  return (
    <Container component="main" aria-label={title} size="xs" py="xl">
      <Stack>
        <Title order={1}>{title}</Title>
        <Alert color="red">{message}</Alert>
        <Anchor component={Link} to={backTo}>
          {backLabel}
        </Anchor>
      </Stack>
    </Container>
  )
}
