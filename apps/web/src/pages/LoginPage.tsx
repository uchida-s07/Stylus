import { Button, Container, Stack, Title } from '@mantine/core'

// ログイン画面（AUTH-F-002）
export function LoginPage() {
  return (
    <Container component="main" aria-label="ログイン" size="xs" py="xl">
      <Stack>
        <Title order={1}>Stylus</Title>
        <Button size="lg">Google でログイン</Button>
      </Stack>
    </Container>
  )
}
