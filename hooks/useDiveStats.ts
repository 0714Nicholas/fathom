'use client'

import { useEffect, useState } from 'react'

export type DiveStats = { divers7d: number | null, dives7d: number | null }

// ランディング用の週間統計。取れなければ null のまま（表示しない）
export function useDiveStats(enabled: boolean): DiveStats {
  const [stats, setStats] = useState<DiveStats>({ divers7d: null, dives7d: null })

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetch('/api/dive-stats', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => { if (json) setStats(json) })
      .catch(() => {})
    return () => controller.abort()
  }, [enabled])

  return stats
}
