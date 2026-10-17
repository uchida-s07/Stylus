import { lazy, Suspense } from 'react'
import { Loading } from '../../components/Loading'

// 車の画面（月のカレンダー・時間割）は開いたときに読み込む（ほかの画面の読み込みを重くしない）
const CarPage = lazy(() => import('./CarPage').then((m) => ({ default: m.CarPage })))

export function LazyCarPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CarPage />
    </Suspense>
  )
}
