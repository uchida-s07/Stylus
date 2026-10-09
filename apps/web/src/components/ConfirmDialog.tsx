import { Button, Group, Modal } from '@mantine/core'
import { useState } from 'react'

// 操作の確認（お金・車の画面で共通）。「キャンセル」なら何もせず閉じる
// 右上の閉じるボタン（×）は出さない（「キャンセル」がある。ログアウトの確認と揃える）
export function ConfirmDialog({
  opened,
  title,
  confirmLabel,
  color,
  onClose,
  onConfirm,
}: {
  opened: boolean
  title: string
  confirmLabel: string
  color?: string
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  async function confirm() {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered withCloseButton={false}>
      <Group grow wrap="nowrap">
        <Button variant="default" px="md" onClick={onClose} disabled={busy}>
          キャンセル
        </Button>
        <Button color={color} px="md" onClick={() => void confirm()} loading={busy}>
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  )
}
