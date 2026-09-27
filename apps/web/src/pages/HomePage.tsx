import { Container, Title } from '@mantine/core'

// アプリのホーム（AUTH-F-002、AUTH-F-004）
export function HomePage() {
  return (
    <Container component="main" aria-label="ホーム" py="xl">
      <Title order={1}>Stylus</Title>
    </Container>
  )
}
