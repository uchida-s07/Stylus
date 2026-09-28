import { Button, createTheme } from '@mantine/core'

// 画面全体の見た目の設定
// 押せる部分は 44×44px 以上にする（COMMON-N-008）。ボタンの標準の大きさを lg（高さ 50px）にして、足すボタンも自動で満たす
export const theme = createTheme({
  components: {
    Button: Button.extend({ defaultProps: { size: 'lg' } }),
  },
})
