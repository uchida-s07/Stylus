import { Center, Loader } from '@mantine/core'

export function Loading() {
  return (
    <Center h="100dvh">
      <Loader aria-label="読み込み中" />
    </Center>
  )
}
