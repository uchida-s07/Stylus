import { Button, Container, Stack, Title } from '@mantine/core'
import { signInWithGoogle } from '../auth/login'

// ログイン画面（AUTH-F-002）
export function LoginPage() {
  return (
    <Container component="main" aria-label="ログイン" size="xs" py="xl">
      <Stack>
        <Title order={1}>Stylus</Title>
        <Button size="lg" onClick={() => void signInWithGoogle()}>
          Google でログイン
        </Button>
      </Stack>
    </Container>
  )
}
