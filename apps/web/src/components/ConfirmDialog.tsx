import { Button, Group, Modal, Text } from '@mantine/core'
import { useState, type ReactNode } from 'react'

// 操作の確認（お金・車の画面で共通）。「キャンセル」なら何もせず閉じる
// children は確認に添える説明（車の「使わないにする」のこれからの予約の件数など）
// 右上の閉じるボタン（×）は出さない（「キャンセル」がある。ログアウトの確認と揃える）
export function ConfirmDialog({
  opened,
  title,
  confirmLabel,
  color,
  children,
  onClose,
  onConfirm,
}: {
  opened: boolean
  title: string
  confirmLabel: string
  color?: string
  children?: ReactNode
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
      {children && <Text mb="md">{children}</Text>}
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
