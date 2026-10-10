import { CAR_MESSAGES, carInputSchema, type CarListItem } from '@stylus/shared'
import {
  Alert,
  Anchor,
  Badge,
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
import { callApi, WRITE_MESSAGES, type ApiResult } from '../../api/responses'
import { useLeaveAsUnregistered } from '../../auth/unregistered'
import { ErrorScreen } from '../../components/ErrorScreen'
import { Loading } from '../../components/Loading'
import { useApiLoad } from '../../components/useApiLoad'

// 車の管理（CAR-F-001〜003・009）：一覧（「使わない」の印）、登録、名前を変える
export function CarsPage() {
  const { state, reload } = useApiLoad(() => callApi(() => api.cars.$get()))
  const [notice, setNotice] = useState<string>()
  const leaveAsUnregistered = useLeaveAsUnregistered()

  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'error') return <ErrorScreen kind={state.error} />

  // 書き込みの結果の共通の扱い。名前の知らせ（同じ名前・入力）は呼び出し側の欄に返す
  async function handleWrite(
    result: ApiResult<unknown>,
  ): Promise<{ ok: true } | { ok: false; nameError?: string }> {
    if (result.kind === 'ok') {
      setNotice(undefined)
      reload()
      return { ok: true }
    }
    if (result.kind === 'unregistered') {
      await leaveAsUnregistered()
      return { ok: false }
    }
    if (result.kind === 'network') {
      setNotice(WRITE_MESSAGES.network)
      return { ok: false }
    }
    const { error } = result
    if (error?.code === 'duplicate_name') return { ok: false, nameError: error.message }
    if (error?.code === 'invalid_input' && error.fields?.name) {
      return { ok: false, nameError: error.fields.name }
    }
    if (error?.code === 'not_found') {
      // 開いた後に削除されていた。一覧を取り直す
      setNotice(CAR_MESSAGES.carNotFound)
      reload()
      return { ok: false }
    }
    setNotice(WRITE_MESSAGES.failed)
    return { ok: false }
  }

  return (
    <Container component="main" aria-label="車の管理" py="md" size="xs">
      <Stack>
        <Group justify="space-between">
          <Title order={1}>車の管理</Title>
          <Anchor component={Link} to="/car">
            車へ
          </Anchor>
        </Group>
        {notice && <Alert color="red">{notice}</Alert>}
        <RegisterForm
          register={async (name) =>
            handleWrite(await callApi(() => api.cars.$post({ json: { name } })))
          }
        />
        <Stack
          component="ul"
          aria-label="車の一覧"
          gap="sm"
          p={0}
          m={0}
          style={{ listStyle: 'none' }}
        >
          {state.data.cars.map((car) => (
            <CarCard
              key={car.id}
              car={car}
              rename={async (name) =>
                handleWrite(
                  await callApi(() =>
                    api.cars[':id'].$patch({ param: { id: car.id }, json: { name } }),
                  ),
                )
              }
            />
          ))}
        </Stack>
      </Stack>
    </Container>
  )
}

type WriteOutcome = { ok: true } | { ok: false; nameError?: string }

// 名前の入力の検証（空白だけ・21文字は送らない）
function nameErrorOf(name: string): string | undefined {
  const parsed = carInputSchema.safeParse({ name })
  return parsed.success ? undefined : parsed.error.issues[0]?.message
}

function RegisterForm({ register }: { register: (name: string) => Promise<WriteOutcome> }) {
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string>()
  const [sending, setSending] = useState(false)
  const busy = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy.current) return
    const error = nameErrorOf(name)
    if (error) return setNameError(error)
    busy.current = true
    setSending(true)
    setNameError(undefined)
    try {
      const outcome = await register(name)
      if (outcome.ok) setName('')
      else setNameError(outcome.nameError)
    } finally {
      busy.current = false
      setSending(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <Group align="flex-start" wrap="nowrap">
        <TextInput
          label="名前"
          style={{ flex: 1 }}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          error={nameError}
        />
        <Button type="submit" mt={25} loading={sending}>
          登録する
        </Button>
      </Group>
    </form>
  )
}

function CarCard({
  car,
  rename,
}: {
  car: CarListItem
  rename: (name: string) => Promise<WriteOutcome>
}) {
  const [editing, setEditing] = useState(false)

  return (
    <Card component="li" withBorder padding="sm">
      <Stack gap="xs">
        <Group gap="xs">
          <Text fw={700}>{car.name}</Text>
          {!car.isActive && (
            <Badge variant="light" color="gray">
              使わない
            </Badge>
          )}
        </Group>
        {editing ? (
          <RenameForm car={car} rename={rename} close={() => setEditing(false)} />
        ) : (
          <Group gap="xs">
            <Button
              variant="default"
              size="xs"
              aria-label={`${car.name}の名前を変える`}
              onClick={() => setEditing(true)}
            >
              名前を変える
            </Button>
          </Group>
        )}
      </Stack>
    </Card>
  )
}

function RenameForm({
  car,
  rename,
  close,
}: {
  car: CarListItem
  rename: (name: string) => Promise<WriteOutcome>
  close: () => void
}) {
  const [name, setName] = useState(car.name)
  const [nameError, setNameError] = useState<string>()
  const [sending, setSending] = useState(false)
  const busy = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy.current) return
    const error = nameErrorOf(name)
    if (error) return setNameError(error)
    busy.current = true
    setSending(true)
    setNameError(undefined)
    try {
      const outcome = await rename(name)
      if (outcome.ok) close()
      else setNameError(outcome.nameError)
    } finally {
      busy.current = false
      setSending(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <Stack gap="xs">
        <TextInput
          label="新しい名前"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          error={nameError}
        />
        <Group gap="xs">
          <Button type="submit" size="xs" loading={sending}>
            保存する
          </Button>
          <Button variant="default" size="xs" onClick={close} disabled={sending}>
            キャンセル
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
