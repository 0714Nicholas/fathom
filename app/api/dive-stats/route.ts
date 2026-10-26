import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export const revalidate = 300

// ランディングの「今週 N人が潜りました」用。テーブルが未作成でも null を返すだけにする
export async function GET() {
  const supabase = getServerSupabase()
  if (!supabase) return NextResponse.json({ divers7d: null, dives7d: null })

  const { data, error } = await supabase.rpc('dive_stats')
  if (error || !Array.isArray(data) || !data[0]) {
    return NextResponse.json({ divers7d: null, dives7d: null })
  }
  return NextResponse.json({
    divers7d: Number(data[0].divers_7d ?? 0),
    dives7d: Number(data[0].dives_7d ?? 0),
  })
}
