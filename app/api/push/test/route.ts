import { NextRequest, NextResponse } from 'next/server'
import { SCHEDULED_BREAK_MS, SCHEDULED_DIVE_MS, portForTime } from '@/lib/schedule/diveSchedule'
import {
  deliver,
  fetchSlotWeather,
  getAdminSupabase,
  isPushConfigured,
  testMessage,
  type StoredSubscription,
} from '@/lib/push/server'
import { isAllowedPushEndpoint } from '@/lib/push/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SLOT_MS = SCHEDULED_DIVE_MS + SCHEDULED_BREAK_MS

// 「試しに送る」。登録済みの通知先にだけ、次の潜航の海を 1 通送る
export async function POST(req: NextRequest) {
  let endpoint: unknown
  try {
    endpoint = (await req.json())?.endpoint
  } catch {
    endpoint = null
  }
  if (typeof endpoint !== 'string' || !isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }
  if (!isPushConfigured()) return NextResponse.json({ error: 'push not configured' }, { status: 503 })

  const supabase = getAdminSupabase()!
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, time_zone, remind_minute, weekdays_only')
    .eq('endpoint', endpoint)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'query failed' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not subscribed' }, { status: 404 })

  const subscription = data as StoredSubscription
  const slot = Math.ceil(Date.now() / SLOT_MS) * SLOT_MS
  const weather = await fetchSlotWeather(req.nextUrl.origin, portForTime(slot).query)
  const result = await deliver(subscription, testMessage(slot, subscription.time_zone, weather))

  if (result === 'gone') {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    return NextResponse.json({ error: 'subscription expired' }, { status: 410 })
  }
  if (result === 'failed') return NextResponse.json({ error: 'delivery failed' }, { status: 502 })
  return NextResponse.json({ ok: true })
}
