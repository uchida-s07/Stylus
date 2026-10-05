import { Alert, Anchor, Container, Stack, Title } from '@mantine/core'
import { Link } from 'react-router'

// 開いた記録が見つからないときなど、知らせだけを出す画面
export function NoticeScreen({ title, message }: { title: string; message: string }) {
  return (
    <Container component="main" aria-label={title} size="xs" py="xl">
      <Stack>
        <Title order={1}>{title}</Title>
        <Alert color="red">{message}</Alert>
        <Anchor component={Link} to="/money">
          お金へ
        </Anchor>
      </Stack>
    </Container>
  )
}
