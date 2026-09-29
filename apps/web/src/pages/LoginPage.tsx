import { Alert, Button, Container, Stack, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import {
  LOGIN_NOTICE_MESSAGES,
  peekLoginNotice,
  setLoginNotice,
  type LoginNotice,
} from '../auth/errors'
import { signInWithGoogle } from '../auth/login'

// ログイン画面（AUTH-F-002）。未登録・失敗のメッセージを出す
export function LoginPage() {
  // 渡されたメッセージは一度だけ出す（出したら消す）
  const [notice, setNotice] = useState<LoginNotice | undefined>(peekLoginNotice)
  useEffect(() => setLoginNotice(undefined), [])

  async function login() {
    setNotice(undefined)
    if (!(await signInWithGoogle())) setNotice('failed')
  }

  return (
    <Container component="main" aria-label="ログイン" size="xs" py="xl">
      <Stack>
        <Title order={1}>Stylus</Title>
        {notice && <Alert color="red">{LOGIN_NOTICE_MESSAGES[notice]}</Alert>}
        <Button onClick={() => void login()}>Google でログイン</Button>
      </Stack>
    </Container>
  )
}
