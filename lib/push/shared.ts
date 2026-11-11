// 毎日の潜航通知で、ブラウザとサーバーの両方から使うもの

// 未設定のあいだは通知の設定を出さず、今までのタブ内の通知だけを使う
export const PUSH_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

// 潜航の何分前に知らせるか（水面で待つ時間に間に合うように）
export const REMIND_LEAD_MINUTES = 5

// 送り先として受け付けるプッシュサービス。任意の URL へサーバーから送らせないため
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
]
const PUSH_SERVICE_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com']

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:') return false
    return PUSH_SERVICE_HOSTS.includes(url.hostname)
      || PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
  } catch {
    return false
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

// 潜航は :00 と :30 だけなので、30 分刻み（0 = 0:00、1410 = 23:30）
export function isValidRemindMinute(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1410 && value % 30 === 0
}

export function formatRemindMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

// その時刻が、この端末のタイムゾーンで「何時何分」か（0〜1439）
export function localMinuteOfDay(ms: number): number {
  const date = new Date(ms)
  return date.getHours() * 60 + date.getMinutes()
}
