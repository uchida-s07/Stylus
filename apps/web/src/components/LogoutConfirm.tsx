import { Button, Group, Modal } from '@mantine/core'
import { useState } from 'react'

// ログアウトの確認（AUTH-F-004）。「キャンセル」なら何もせず閉じる
export function LogoutConfirm({
  opened,
  onClose,
  onConfirm,
}: {
  opened: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="ログアウトしますか？" centered>
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose} disabled={busy}>
          キャンセル
        </Button>
        <Button color="red" onClick={() => void confirm()} loading={busy}>
          ログアウト
        </Button>
      </Group>
    </Modal>
  )
}
