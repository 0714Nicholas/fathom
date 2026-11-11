import { NextRequest, NextResponse } from 'next/server'
import { SCHEDULED_BREAK_MS, SCHEDULED_DIVE_MS, portForTime } from '@/lib/schedule/diveSchedule'
import {
  dateIn,
  deliver,
  fetchSlotWeather,
  getAdminSupabase,
  hasCronSecret,
  isPushConfigured,
  reminderMessage,
  type StoredSubscription,
} from '@/lib/push/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SLOT_MS = SCHEDULED_DIVE_MS + SCHEDULED_BREAK_MS
// 定期実行が遅れても、潜航の 10 分前より早くは送らない
const MAX_LEAD_MS = 10 * 60 * 1000

// Supabase の pg_cron から毎時 :25 と :55 に呼ばれ、5 分後の潜航を知らせる
export async function POST(req: NextRequest) {
  if (!hasCronSecret(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isPushConfigured()) return NextResponse.json({ error: 'push not configured' }, { status: 503 })

  const now = Date.now()
  const slot = Math.ceil(now / SLOT_MS) * SLOT_MS
  if (slot - now > MAX_LEAD_MS) {
    return NextResponse.json({ ok: true, skipped: 'no dive starts soon', sent: 0 })
  }

  const supabase = getAdminSupabase()!
  const { data, error } = await supabase.rpc('due_push_subscriptions', { p_slot: new Date(slot).toISOString() })
  if (error) {
    console.warn('[Minasoko] due subscriptions query failed:', error.message)
    return NextResponse.json({ error: 'query failed' }, { status: 500 })
  }

  const subscriptions = (data ?? []) as StoredSubscription[]
  if (subscriptions.length === 0) {
    return NextResponse.json({ ok: true, slot: new Date(slot).toISOString(), sent: 0, gone: 0, failed: 0 })
  }

  // 海は全員共通なので、天気は 1 回だけ取る
  const weather = await fetchSlotWeather(req.nextUrl.origin, portForTime(slot).query)

  let sent = 0
  let gone = 0
  let failed = 0
  await Promise.all(subscriptions.map(async (subscription) => {
    const result = await deliver(subscription, reminderMessage(slot, subscription.time_zone, weather))
    if (result === 'sent') {
      sent += 1
      await supabase
        .from('push_subscriptions')
        .update({ last_sent_on: dateIn(slot, subscription.time_zone) })
        .eq('endpoint', subscription.endpoint)
    } else if (result === 'gone') {
      gone += 1
      await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
    } else {
      failed += 1
    }
  }))

  return NextResponse.json({ ok: true, slot: new Date(slot).toISOString(), sent, gone, failed })
}
