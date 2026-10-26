import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// API ルート用。lib/supabase/client.ts は 'use client' なのでサーバーからは使えない
let cached: SupabaseClient | null = null

export function getServerSupabase(): SupabaseClient | null {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  cached = createClient(url, anonKey, { auth: { persistSession: false } })
  return cached
}
