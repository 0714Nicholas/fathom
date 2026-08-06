'use client'

import { useState, useEffect, useCallback } from 'react'
import { generateFathomCoordinate, isValidFathomCoordinate, formatCoordinateForSystem } from '@/lib/identity/coordinates'
// import { supabase } from '@/lib/supabase/client' // ※実際のSupabaseクライアントがある場合はこちらをインポート

// --- 動作確認用のダミーSupabaseクライアント（本番実装時は消してください） ---
const supabase: any = {
  auth: {
    signInAnonymously: async () => ({ data: { user: { id: `anon-${Date.now()}` } }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null })
  },
  from: (table: string) => ({
    select: () => ({ eq: async () => ({ data: [], error: null }), single: async () => ({ data: null, error: null }) }),
    insert: async (data: any) => ({ error: null })
  })
}
// -------------------------------------------------------------------------

export function useSelfSeed() {
  const [seed, setSeed] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const initializeSeed = async () => {
      let storedSeed = window.localStorage.getItem('fathom:self-id')
      
      let { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (!error && data.user) user = data.user
      }

      if (storedSeed && isValidFathomCoordinate(storedSeed)) {
        setSeed(storedSeed)
      } else {
        const nextCoordinate = generateFathomCoordinate()
        window.localStorage.setItem('fathom:self-id', nextCoordinate)
        setSeed(nextCoordinate)
        
        if (user) {
          await supabase.from('seed_bindings').insert({
            seed: nextCoordinate,
            user_id: user.id
          }).catch(() => console.warn('Seed binding already exists or failed'))
        }
      }
      setIsLoading(false)
    }

    initializeSeed()
  }, [])

  const restoreSeed = useCallback(async (inputSeed: string) => {
    const formatted = formatCoordinateForSystem(inputSeed)
    if (!isValidFathomCoordinate(formatted)) return false

    // 本来はここでSupabaseに問い合わせてSeedが存在するか確認します
    // const { data } = await supabase.from('seed_bindings').select('user_id').eq('seed', formatted).single()
    // if (!data) return false

    window.localStorage.setItem('fathom:self-id', formatted)
    window.location.reload()
    return true
  }, [])

  return { seed, isLoading, restoreSeed }
}