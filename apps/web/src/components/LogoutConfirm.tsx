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
    // 右上の閉じるボタン（×）は出さない。「キャンセル」があるので要らない（Esc・外側を押しても閉じる）
    <Modal
      opened={opened}
      onClose={onClose}
      title="ログアウトしますか？"
      centered
      withCloseButton={false}
    >
      {/* 幅 360px のスマホでも2つのボタンを横に並べる（半分ずつの幅にし、左右の余白を詰める） */}
      <Group grow wrap="nowrap">
        <Button variant="default" px="md" onClick={onClose} disabled={busy}>
          キャンセル
        </Button>
        <Button color="red" px="md" onClick={() => void confirm()} loading={busy}>
          ログアウト
        </Button>
      </Group>
    </Modal>
  )
}
