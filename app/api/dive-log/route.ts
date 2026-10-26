import { NextRequest, NextResponse } from 'next/server'
import { PORTS } from '@/lib/scene/ports'
import { isValidFathomCoordinate } from '@/lib/identity/coordinates'
import { getServerSupabase } from '@/lib/supabase/server'

const MODES = new Set(['scheduled', 'meditate', 'focus', 'sleep'])
const PORT_NAMES = new Set(PORTS.map((p) => p.name))
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_DURATION_MS = 3 * 60 * 60 * 1000

// 潜航 1 回分の記録を受け取る。ページを閉じるときの sendBeacon（text/plain）でも届くように本文を自前で JSON として読む
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = JSON.parse(await req.text())
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const { id, seed, mode, port, slotStart, startedAt, durationMs, completed } = body
  const startedAtMs = typeof startedAt === 'number' ? startedAt : NaN
  const valid =
    typeof id === 'string' && UUID_RE.test(id) &&
    typeof seed === 'string' && isValidFathomCoordinate(seed) &&
    typeof mode === 'string' && MODES.has(mode) &&
    (port == null || (typeof port === 'string' && PORT_NAMES.has(port))) &&
    (slotStart == null || typeof slotStart === 'number') &&
    Number.isFinite(startedAtMs) && Math.abs(Date.now() - startedAtMs) < 4 * 60 * 60 * 1000 &&
    typeof durationMs === 'number' && durationMs >= 0 && durationMs <= MAX_DURATION_MS &&
    typeof completed === 'boolean'

  if (!valid) return NextResponse.json({ error: 'invalid payload' }, { status: 400 })

  const supabase = getServerSupabase()
  if (!supabase) return NextResponse.json({ ok: false, reason: 'supabase not configured' }, { status: 202 })

  const { error } = await supabase.from('dive_logs').insert({
    id,
    seed,
    mode,
    port: port ?? null,
    slot_start: typeof slotStart === 'number' ? new Date(slotStart).toISOString() : null,
    started_at: new Date(startedAtMs).toISOString(),
    duration_ms: Math.round(durationMs as number),
    completed,
  })

  // 同じ id の二重送信は成功扱いでよい
  if (error && error.code !== '23505') {
    console.warn('[Fathom] dive log insert failed:', error.message)
    return NextResponse.json({ ok: false }, { status: 202 })
  }
  return NextResponse.json({ ok: true })
}
