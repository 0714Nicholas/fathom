'use client'

import { useState, useEffect, useCallback } from 'react'
import { generateFathomCoordinate, isValidFathomCoordinate, formatCoordinateForSystem } from '@/lib/identity/coordinates'
import { getSupabaseClient } from '@/lib/supabase/client'

const SEED_KEY = 'fathom:self-id'

// localStorage はプライベートモード等で例外を投げることがあるので必ず try で包む
function readStoredSeed(): string | null {
  try { return window.localStorage.getItem(SEED_KEY) } catch { return null }
}

function writeStoredSeed(seed: string): boolean {
  try {
    window.localStorage.setItem(SEED_KEY, seed)
    return true
  } catch {
    return false
  }
}

export function useSelfSeed() {
  const [seed, setSeed] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const storedSeed = readStoredSeed()

    if (storedSeed && isValidFathomCoordinate(storedSeed)) {
      setSeed(storedSeed)
    } else {
      const nextCoordinate = generateFathomCoordinate()
      writeStoredSeed(nextCoordinate)
      setSeed(nextCoordinate)
    }
    setIsLoading(false)
  }, [])

  // 座標を知っていれば復帰できる設計（アカウントは持たない）。
  // 訪れたことのある座標には crystal_karma の行があるので、それで実在を確かめる
  const restoreSeed = useCallback(async (inputSeed: string) => {
    const formatted = formatCoordinateForSystem(inputSeed)
    if (!isValidFathomCoordinate(formatted)) return false

    const supabase = getSupabaseClient()
    if (supabase) {
      const { data, error } = await supabase
        .from('crystal_karma')
        .select('seed')
        .eq('seed', formatted)
        .limit(1)
      if (error || !data?.length) return false
    }

    if (!writeStoredSeed(formatted)) return false
    window.location.reload()
    return true
  }, [])

  return { seed, isLoading, restoreSeed }
}
