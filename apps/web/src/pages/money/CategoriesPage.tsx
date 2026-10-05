import { categoryInputSchema, type Category } from '@stylus/shared'
import {
  Alert,
  Anchor,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api } from '../../api/client'
import { callApi, WRITE_MESSAGES } from '../../api/responses'
import { useLeaveAsUnregistered } from '../../auth/unregistered'
import { ErrorScreen } from '../../components/ErrorScreen'
import { Loading } from '../../components/Loading'
import { ConfirmDialog } from './ConfirmDialog'
import { useApiLoad } from './useApiLoad'

// カテゴリーの一覧・追加・削除（MONEY-F-013・014）
export function CategoriesPage() {
  const { state, reload } = useApiLoad(() => callApi(() => api['bill-categories'].$get()))
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<Category>()
  const sending = useRef(false)
  const leaveAsUnregistered = useLeaveAsUnregistered()

  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'error') return <ErrorScreen kind={state.error} />

  async function add(event: FormEvent) {
    event.preventDefault()
    if (sending.current) return
    const parsed = categoryInputSchema.safeParse({ name })
    if (!parsed.success) return setNameError(parsed.error.issues[0]?.message)
    sending.current = true
    setAdding(true)
    setNameError(undefined)
    setNotice(undefined)
    try {
      const result = await callApi(() => api['bill-categories'].$post({ json: parsed.data }))
      if (result.kind === 'ok') {
        setName('')
        return reload()
      }
      if (result.kind === 'unregistered') return void (await leaveAsUnregistered())
      if (result.kind === 'network') return setNotice(WRITE_MESSAGES.network)
      const { error } = result
      if (error?.code === 'duplicate_name') return setNameError(error.message)
      if (error?.code === 'invalid_input') return setNameError(error.fields?.name ?? error.message)
      setNotice(WRITE_MESSAGES.failed)
    } finally {
      sending.current = false
      setAdding(false)
    }
  }

  async function remove(category: Category) {
    const result = await callApi(() =>
      api['bill-categories'][':id'].$delete({ param: { id: category.id } }),
    )
    setDeleting(undefined)
    if (result.kind === 'ok') {
      setNotice(undefined)
      return reload()
    }
    if (result.kind === 'unregistered') return void (await leaveAsUnregistered())
    if (result.kind === 'network') return setNotice(WRITE_MESSAGES.network)
    const { error } = result
    // 使われている（409 in_use）・すでに無い（404 not_found）は API の知らせをそのまま出す
    if (error?.code === 'in_use' || error?.code === 'not_found') {
      setNotice(error.message)
      return reload()
    }
    setNotice(WRITE_MESSAGES.failed)
  }

  return (
    <Container component="main" aria-label="カテゴリー" py="md" size="xs">
      <Stack>
        <Group justify="space-between">
          <Title order={1}>カテゴリー</Title>
          <Anchor component={Link} to="/money">
            お金へ
          </Anchor>
        </Group>
        {notice && <Alert color="red">{notice}</Alert>}
        <form onSubmit={(e) => void add(e)} noValidate>
          <Group align="flex-start" wrap="nowrap">
            <TextInput
              label="名前"
              style={{ flex: 1 }}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              error={nameError}
            />
            <Button type="submit" mt={25} loading={adding}>
              追加する
            </Button>
          </Group>
        </form>
        {state.data.categories.map((c) => (
          <Card key={c.id} withBorder padding="sm">
            <Group justify="space-between" wrap="nowrap">
              <Text>{c.name}</Text>
              <Button
                variant="subtle"
                color="red"
                aria-label={`${c.name}を削除`}
                onClick={() => setDeleting(c)}
              >
                削除
              </Button>
            </Group>
          </Card>
        ))}
      </Stack>
      {deleting && (
        <ConfirmDialog
          opened
          title={`「${deleting.name}」を削除しますか？`}
          confirmLabel="削除する"
          color="red"
          onClose={() => setDeleting(undefined)}
          onConfirm={() => remove(deleting)}
        />
      )}
    </Container>
  )
}
