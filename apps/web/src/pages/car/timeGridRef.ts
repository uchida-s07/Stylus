import type { CalendarRef } from '@fullcalendar/react'
import { createRef } from 'react'

// 車の画面の時間割（FullCalendar）。範囲の選択を消すのと、テストから範囲の選択を起こすのに使う
// （jsdom ではドラッグ・長押しを再現できないため、テストは FullCalendar の select を呼ぶ。spec 004「テスト」）
export const timeGridRef = createRef<CalendarRef>()
