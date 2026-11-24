import { timingSafeEqual } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendNotification, setVapidDetails, WebPushError } from 'web-push'
import { portForTime } from '@/lib/schedule/diveSchedule'
import { PUSH_PUBLIC_KEY, REMIND_LEAD_MINUTES } from '@/lib/push/shared'
import { SITE_URL } from '@/lib/site'
import { seaCondition, shortPlaceName } from '@/lib/weather/seaCondition'

// API ルート専用。service_role の鍵を使うので、ブラウザ側から import しない

export type StoredSubscription = {
  endpoint: string
  p256dh: string
  auth: string
  time_zone: string
  remind_minute: number
  weekdays_only: boolean
}

export type PushMessage = {
  title: string
  body: string
  url: string
  tag: string
}

export type SlotWeather = { windSpeed: number, temp: number | null, word: string | null } | null

let admin: SupabaseClient | null = null

export function getAdminSupabase(): SupabaseClient | null {
  if (admin) return admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return admin
}

export function isPushConfigured(): boolean {
  return Boolean(PUSH_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && getAdminSupabase())
}

// 定期実行からの呼び出しだけを通す（文字列の比較時間から合言葉を推測されないようにする）
export function hasCronSecret(req: Request): boolean {
  const secret = process.env.PUSH_CRON_SECRET
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(req.headers.get('authorization') ?? '')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

let vapidReady = false

function ensureVapid() {
  if (vapidReady) return
  setVapidDetails(process.env.VAPID_SUBJECT || SITE_URL, PUSH_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY ?? '')
  vapidReady = true
}

// gone は「もう届かない通知先」（アプリを消した・通知を止めた）。呼び出し側で削除する
export async function deliver(subscription: StoredSubscription, message: PushMessage): Promise<'sent' | 'gone' | 'failed'> {
  ensureVapid()
  try {
    await sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(message),
      { TTL: 10 * 60, urgency: 'high' },
    )
    return 'sent'
  } catch (err) {
    if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) return 'gone'
    console.warn('[Minasoko] push delivery failed:', err instanceof WebPushError ? err.statusCode : err)
    return 'failed'
  }
}

export function clockIn(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('ja-JP', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)
}

// その人のタイムゾーンでの日付（YYYY-MM-DD）
export function dateIn(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms)
}

// 自分の /api/weather を通して取る（同じキャッシュを使い、OpenWeather への問い合わせを増やさない）
export async function fetchSlotWeather(origin: string, query: string): Promise<SlotWeather> {
  try {
    const res = await fetch(new URL(`/api/weather?city=${encodeURIComponent(query)}`, origin), {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json()
    if (typeof json.windSpeed !== 'number') return null
    const temp = typeof json.temp === 'number' ? json.temp : null
    // 画面の「スヴァールバルは、いま吹雪。」と同じ言葉にする
    const word = temp == null ? null : seaCondition({
      windSpeed: json.windSpeed,
      rainAmount: (Number(json.rain1h) || 0) + (Number(json.rain3h) || 0),
      snowAmount: Number(json.snow1h) || 0,
      clouds: Number(json.clouds) || 0,
      temp,
    }).word
    return { windSpeed: json.windSpeed, temp, word }
  } catch {
    return null
  }
}

// 例：「スヴァールバルは、いま吹雪。風 12.1 m/s・-9.8°C」
function seaText(slotMs: number, weather: SlotWeather): string {
  const port = portForTime(slotMs)
  if (!weather) return `今日の海は ${port.label}`
  const temp = weather.temp != null ? `・${weather.temp.toFixed(1)}°C` : ''
  const numbers = `風 ${weather.windSpeed.toFixed(1)} m/s${temp}`
  if (weather.word) return `${shortPlaceName(port.label)}は、いま${weather.word}。${numbers}`
  return `今日の海は ${port.label}。${numbers}`
}

export function reminderMessage(slotMs: number, timeZone: string, weather: SlotWeather): PushMessage {
  return {
    title: `${clockIn(slotMs, timeZone)} の潜航まであと${REMIND_LEAD_MINUTES}分`,
    body: seaText(slotMs, weather),
    url: '/?from=push',
    tag: 'minasoko-reminder',
  }
}

export function testMessage(slotMs: number, timeZone: string, weather: SlotWeather): PushMessage {
  return {
    title: '通知を受け取れます',
    body: `次の潜航は ${clockIn(slotMs, timeZone)}。${seaText(slotMs, weather)}`,
    url: '/?from=push',
    tag: 'minasoko-test',
  }
}
