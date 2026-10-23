'use client'

import { useEffect, useState } from 'react'
import { getScheduleState, type ScheduleState } from '@/lib/schedule/diveSchedule'

// 定時潜航の時計。enabled の間だけ 1 秒ごとに更新する
export function useDiveSchedule(enabled: boolean): ScheduleState {
  const [state, setState] = useState<ScheduleState>(() => getScheduleState())

  useEffect(() => {
    if (!enabled) return
    setState(getScheduleState())
    const id = window.setInterval(() => setState(getScheduleState()), 1000)
    return () => window.clearInterval(id)
  }, [enabled])

  return state
}
