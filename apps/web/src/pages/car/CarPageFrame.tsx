import { ActionIcon, Anchor, Button, Container, Group, Menu, Stack, Title } from '@mantine/core'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

// 車の画面の外枠（月のカレンダーの画面と日の時間割の画面で同じ）：見出し・ホームへ・右上のメニュー・「予約する」
export function CarPageFrame({ children }: { children: ReactNode }) {
  return (
    <Container component="main" aria-label="車" py="md">
      <Stack>
        <Group justify="space-between" wrap="nowrap">
          <Title order={1}>車</Title>
          <Group gap="xs" wrap="nowrap">
            <Anchor component={Link} to="/">
              ホームへ
            </Anchor>
            <CarMenu />
          </Group>
        </Group>
        <Button component={Link} to="/car/reservations/new">
          予約する
        </Button>
        {children}
      </Stack>
    </Container>
  )
}

// 右上のメニュー：履歴と車の管理
function CarMenu() {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="subtle" size="lg" aria-label="メニュー">
          ⋯
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={Link} to="/car/history">
          履歴
        </Menu.Item>
        <Menu.Item component={Link} to="/car/cars">
          車の管理
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
