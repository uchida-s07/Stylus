import { Anchor, Stack, Text } from '@mantine/core'
import { Link } from 'react-router'

// 車が1台も無い（CAR-F-005/AC-8）・「使う」の車が無い（CAR-F-004/AC-13）
// 車の画面（遅延読み込み）と予約の入力の画面の両方で使うので、別のファイルに置く
export function NoCars({ message = '車が登録されていません' }: { message?: string }) {
  return (
    <Stack gap="xs">
      <Text>{message}</Text>
      <Anchor component={Link} to="/car/cars">
        車の管理へ
      </Anchor>
    </Stack>
  )
}
