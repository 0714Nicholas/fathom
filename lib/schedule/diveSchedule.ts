import { PORTS, type FathomPort } from '@/lib/scene/ports'

// 定時潜航：毎時 :00 と :30 に全員で潜り始める（25 分潜航 + 5 分浮上）。
// 全員が同じ時計から計算するので、同期のためのサーバーは要らない。
export const SCHEDULED_DIVE_MS = 25 * 60 * 1000
export const SCHEDULED_BREAK_MS = 5 * 60 * 1000
const SLOT_MS = SCHEDULED_DIVE_MS + SCHEDULED_BREAK_MS
const HOUR_MS = 60 * 60 * 1000

export type SchedulePhase = 'diving' | 'surfacing'

export type ScheduleState = {
  phase: SchedulePhase
  /** 今のフェーズに入ってからの経過 ms */
  elapsedInPhase: number
  /** 今のフェーズが終わるまでの ms */
  remainingInPhase: number
  /** 潜航中ならその潜航の開始時刻、浮上中なら次の潜航の開始時刻 */
  diveStartsAt: number
  /** diveStartsAt の潜航で潜る海（1 時間ごとに全員共通） */
  port: FathomPort
}

// 1 時間ごとに海を変える。7 は 25 と互いに素なので、25 時間で全部の海を一巡する
export function portForTime(ms: number): FathomPort {
  const hour = Math.floor(ms / HOUR_MS)
  const index = ((hour * 7) % PORTS.length + PORTS.length) % PORTS.length
  return PORTS[index]
}

export function getScheduleState(now: number = Date.now()): ScheduleState {
  const slotStart = Math.floor(now / SLOT_MS) * SLOT_MS
  const t = now - slotStart

  if (t < SCHEDULED_DIVE_MS) {
    return {
      phase: 'diving',
      elapsedInPhase: t,
      remainingInPhase: SCHEDULED_DIVE_MS - t,
      diveStartsAt: slotStart,
      port: portForTime(slotStart),
    }
  }

  const nextDive = slotStart + SLOT_MS
  return {
    phase: 'surfacing',
    elapsedInPhase: t - SCHEDULED_DIVE_MS,
    remainingInPhase: SLOT_MS - t,
    diveStartsAt: nextDive,
    port: portForTime(nextDive),
  }
}

export function formatClockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}
