import { NextRequest, NextResponse } from 'next/server'
import { isValidFathomCoordinate } from '@/lib/identity/coordinates'
import { getAdminSupabase, isPushConfigured } from '@/lib/push/server'
import { isAllowedPushEndpoint, isValidRemindMinute, isValidTimeZone } from '@/lib/push/shared'

export const runtime = 'nodejs'

const KEY_RE = /^[A-Za-z0-9_-]+=*$/

async function readJson(req: NextRequest): Promise<Record<string, any> | null> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

// 毎日の潜航通知の登録と、時刻・曜日の変更（同じ通知先なら上書き）
export async function POST(req: NextRequest) {
  const body = await readJson(req)
  const subscription = body?.subscription
  const endpoint = subscription?.endpoint
  const p256dh = subscription?.keys?.p256dh
  const auth = subscription?.keys?.auth

  const valid =
    typeof endpoint === 'string' && endpoint.length <= 1000 && isAllowedPushEndpoint(endpoint) &&
    typeof p256dh === 'string' && p256dh.length >= 20 && p256dh.length <= 200 && KEY_RE.test(p256dh) &&
    typeof auth === 'string' && auth.length >= 8 && auth.length <= 100 && KEY_RE.test(auth) &&
    typeof body?.timeZone === 'string' && isValidTimeZone(body.timeZone) &&
    isValidRemindMinute(body?.remindMinute) &&
    typeof body?.weekdaysOnly === 'boolean' &&
    (body?.seed == null || (typeof body.seed === 'string' && isValidFathomCoordinate(body.seed)))

  if (!valid) return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  if (!isPushConfigured()) return NextResponse.json({ error: 'push not configured' }, { status: 503 })

  const { error } = await getAdminSupabase()!.from('push_subscriptions').upsert(
    {
      endpoint,
      p256dh,
      auth,
      seed: body.seed ?? null,
      time_zone: body.timeZone,
      remind_minute: body.remindMinute,
      weekdays_only: body.weekdaysOnly,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )

  if (error) {
    console.warn('[Minasoko] push subscribe failed:', error.message)
    return NextResponse.json({ error: 'save failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// 通知を止める。通知先を知っている本人だけが消せる
export async function DELETE(req: NextRequest) {
  const body = await readJson(req)
  const endpoint = body?.endpoint
  if (typeof endpoint !== 'string' || !isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }
  if (!isPushConfigured()) return NextResponse.json({ error: 'push not configured' }, { status: 503 })

  const { error } = await getAdminSupabase()!.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) {
    console.warn('[Minasoko] push unsubscribe failed:', error.message)
    return NextResponse.json({ error: 'delete failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
