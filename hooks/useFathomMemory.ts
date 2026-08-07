'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
// 🚨 修正：あなたのファイルに合わせて getSupabaseClient をインポートします
import { getSupabaseClient } from '@/lib/supabase/client'
import { useSelfSeed } from '@/hooks/useSelfSeed'

export function useFathomMemory(isActive: boolean) {
  const { seed } = useSelfSeed()
  
  // 🚨 修正：フック内で関数を呼び出し、クライアント（またはnull）を取得します
  const supabase = useMemo(() => getSupabaseClient(), [])
  
  const [diveTimeMs, setDiveTimeMs] = useState(0)
  const [releaseCount, setReleaseCount] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)

  const savedTimeRef = useRef(0)
  const syncTimeoutRef = useRef<number | null>(null)

  // 1. 初回ロード：Seedに基づく過去のKarma（業）をDBから取得
  useEffect(() => {
    // supabase が null の場合（環境変数未設定時）は通信をスキップしてローカル動作を担保
    if (!seed || !supabase) {
      setIsLoaded(true)
      return
    }

    const loadKarma = async () => {
      const { data, error } = await supabase
        .from('crystal_karma')
        .select('*')
        .eq('seed', seed)
        .single()

      if (data) {
        setDiveTimeMs(data.total_age_ms || 0)
        setReleaseCount(data.total_releases || 0)
        savedTimeRef.current = data.total_age_ms || 0
      } else {
        // 新規ダイバーの場合は初期レコードを作成
        await supabase.from('crystal_karma').insert({
          seed,
          total_age_ms: 0,
          total_releases: 0
        })
      }
      setIsLoaded(true)
    }

    loadKarma()
  }, [seed, supabase])

  // 2. Age（潜行時間）のローカル加算と、定期的なDB同期（Debounce）
  useEffect(() => {
    if (!isActive || !isLoaded || !seed || !supabase) return

    const TICK_MS = 1000
    const timer = window.setInterval(() => {
      setDiveTimeMs(prev => {
        const nextTime = prev + TICK_MS
        
        // 10秒（10000ms）潜るごとにDBに同期（通信頻度を抑える）
        if (nextTime - savedTimeRef.current >= 10000) {
          savedTimeRef.current = nextTime
          
          if (syncTimeoutRef.current) window.clearTimeout(syncTimeoutRef.current)
          syncTimeoutRef.current = window.setTimeout(async () => {
            await supabase
              .from('crystal_karma')
              .update({ total_age_ms: nextTime, updated_at: new Date().toISOString() })
              .eq('seed', seed)
          }, 1000) 
        }
        
        return nextTime
      })
    }, TICK_MS)

    return () => {
      window.clearInterval(timer)
      if (syncTimeoutRef.current) window.clearTimeout(syncTimeoutRef.current)
    }
  }, [isActive, isLoaded, seed, supabase])

  // 3. Release（思考の手放し）の加算と即時DB保存
  const incrementRelease = useCallback(async () => {
    if (!seed || !isLoaded) return

    setReleaseCount(prev => {
      const nextCount = prev + 1
      
      // DB通信可能な場合のみ即時保存
      if (supabase) {
        supabase
          .from('crystal_karma')
          .update({ total_releases: nextCount, updated_at: new Date().toISOString() })
          .eq('seed', seed)
          .then()
      }
      
      return nextCount
    })
  }, [seed, isLoaded, supabase])

  return {
    diveTimeMs,
    releaseCount,
    incrementRelease,
    isLoaded
  }
}