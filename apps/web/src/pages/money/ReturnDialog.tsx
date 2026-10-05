import { billReturnInputSchema } from '@stylus/shared'
import { Alert, Button, Group, Modal, Stack, Textarea } from '@mantine/core'
import { useState } from 'react'

// 差し戻す（MONEY-F-008）：理由を入れて送る。理由が空（空白だけを含む）なら止める
// 送ったが保存できなかったときは、入力した理由を残す（閉じない）
export function ReturnDialog({
  version,
  notice,
  onClose,
  onSubmit,
}: {
  version: number
  // 書き込みに失敗したときの知らせ
  notice?: string
  onClose: () => void
  onSubmit: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (busy) return
    const parsed = billReturnInputSchema.safeParse({ version, reason })
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path[0] === 'reason')
      return setError(issue?.message)
    }
    setError(undefined)
    setBusy(true)
    try {
      await onSubmit(parsed.data.reason)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal opened onClose={onClose} title="差し戻す" centered withCloseButton={false}>
      <Stack>
        {notice && <Alert color="red">{notice}</Alert>}
        <Textarea
          label="理由"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          error={error}
        />
        <Group grow wrap="nowrap">
          <Button variant="default" px="md" onClick={onClose} disabled={busy}>
            キャンセル
          </Button>
          <Button px="md" onClick={() => void submit()} loading={busy}>
            差し戻す
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
