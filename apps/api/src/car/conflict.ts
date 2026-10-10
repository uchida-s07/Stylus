import type { ApiError } from '@stylus/shared'
import { and, asc, eq, gt, lt, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { carReservations, members } from '../db/schema'
import { ApiFailure, apiError } from '../errors'

type Conflict = NonNullable<ApiError['error']['conflict']>

// 排他制約に止められた後に、重なった相手の予約を1回だけ引く（design.md「重なりの防ぎ方」）
// 重ならない普通の登録・変更では呼ばない。exceptId は直している自分の予約
export async function findConflict(
  db: Db,
  period: { carId: string; startsAt: Date; endsAt: Date; exceptId?: string },
): Promise<Conflict | undefined> {
  const [row] = await db
    .select({
      displayName: members.displayName,
      startsAt: carReservations.startsAt,
      endsAt: carReservations.endsAt,
    })
    .from(carReservations)
    .innerJoin(members, eq(carReservations.memberId, members.id))
    .where(
      and(
        eq(carReservations.carId, period.carId),
        lt(carReservations.startsAt, period.endsAt),
        gt(carReservations.endsAt, period.startsAt),
        period.exceptId ? ne(carReservations.id, period.exceptId) : undefined,
      ),
    )
    .orderBy(asc(carReservations.startsAt))
    .limit(1)
  return (
    row && {
      displayName: row.displayName,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
    }
  )
}

// 409 overlap。重なった予約が引けたら conflict に付ける（引くまでの間に消えていれば付けない）
export async function failOverlap(
  db: Db,
  period: Parameters<typeof findConflict>[1],
): Promise<never> {
  const conflict = await findConflict(db, period)
  throw new ApiFailure(409, {
    error: {
      ...apiError('overlap', 'その時間はほかの予約と重なっています').error,
      ...(conflict && { conflict }),
    },
  })
}
