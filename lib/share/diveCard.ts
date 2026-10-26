import { SITE_URL } from '@/lib/site'

export type DiveCardInfo = {
  startedAt: number
  minutes: number
  modeLabel: string      // 例：'定時潜航'、'Focus'
  portLabel: string      // 例：'世界一孤立した島 / トリスタン・ダ・クーニャ'
  portName: string       // 例：'Tristan da Cunha'
  weather: { windSpeed: number, temp: number } | null
  companions: number     // 自分を含む人数
  sunk?: number          // 潜航中に沈めたもやもやの数（中身は載せない）
}

const MINCHO = '"Shippori Mincho", "Noto Serif JP", "Yu Mincho", serif'

function formatDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function companionsLine(n: number): string {
  return n > 1 ? `${n}人と一緒に潜った` : '貸し切りの海で潜った'
}

export function diveShareText(info: DiveCardInfo): string {
  const place = info.portLabel.split(' / ').pop() ?? info.portName
  const weather = info.weather ? `（風 ${info.weather.windSpeed.toFixed(1)}m/s・${Math.round(info.weather.temp)}°C）` : ''
  const who = info.companions > 1 ? `${info.companions}人で` : ''
  const sunk = info.sunk ? `もやもやを${info.sunk}つ沈めてきた。` : ''
  return `${info.modeLabel}で${who}「${place}」の海に${info.minutes}分潜った${weather}。${sunk} #Fathom`
}

// SNS 向けの縦長カード（1080×1350）を描く
async function drawCard(info: DiveCardInfo): Promise<HTMLCanvasElement> {
  try { await document.fonts?.load(`400 64px ${MINCHO}`) } catch { /* フォントが無くても描ける */ }

  const W = 1080, H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#0b2234')
  bg.addColorStop(0.55, '#061421')
  bg.addColorStop(1, '#02050a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // 結晶（OGP 画像と同じ雰囲気の球）
  const cx = W / 2, cy = 500, r = 230
  const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.8)
  halo.addColorStop(0, 'rgba(143, 216, 255, 0.18)')
  halo.addColorStop(1, 'rgba(143, 216, 255, 0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, W, H)
  const sphere = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r)
  sphere.addColorStop(0, 'rgba(220, 244, 255, 0.95)')
  sphere.addColorStop(0.12, 'rgba(143, 216, 255, 0.6)')
  sphere.addColorStop(0.45, 'rgba(36, 104, 156, 0.8)')
  sphere.addColorStop(0.8, 'rgba(8, 30, 52, 0.95)')
  sphere.addColorStop(1, '#02050a')
  ctx.fillStyle = sphere
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.font = '300 34px monospace'
  ctx.fillText('F A T H O M', cx, 130)

  const [area, place] = info.portLabel.includes(' / ') ? info.portLabel.split(' / ') : ['', info.portLabel]
  if (area) {
    ctx.fillStyle = 'rgba(235, 245, 252, 0.6)'
    ctx.font = `400 36px ${MINCHO}`
    ctx.fillText(area, cx, 850)
  }
  ctx.fillStyle = '#eaf6ff'
  ctx.font = `400 68px ${MINCHO}`
  ctx.fillText(place, cx, 930)

  ctx.fillStyle = 'rgba(235, 245, 252, 0.75)'
  ctx.font = `400 34px ${MINCHO}`
  ctx.fillText(`${info.modeLabel}  ${info.minutes}分`, cx, 1030)

  ctx.fillStyle = 'rgba(235, 245, 252, 0.5)'
  ctx.font = '300 28px monospace'
  ctx.fillText(formatDate(info.startedAt), cx, 1085)
  if (info.weather) {
    ctx.fillText(`wind ${info.weather.windSpeed.toFixed(1)} m/s  ·  ${info.weather.temp.toFixed(1)}°C`, cx, 1130)
  }

  ctx.fillStyle = 'rgba(143, 216, 255, 0.9)'
  ctx.font = `400 36px ${MINCHO}`
  ctx.fillText(companionsLine(info.companions), cx, info.sunk ? 1185 : 1205)
  if (info.sunk) {
    ctx.fillStyle = 'rgba(235, 245, 252, 0.6)'
    ctx.font = `400 28px ${MINCHO}`
    ctx.fillText(`もやもやを ${info.sunk}つ 深海に置いてきた`, cx, 1235)
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.font = '300 24px monospace'
  ctx.fillText(new URL(SITE_URL).host, cx, 1295)

  return canvas
}

// スマホなら共有シートで、PC ならダウンロードで渡す
export async function shareDiveCard(info: DiveCardInfo): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const canvas = await drawCard(info)
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return 'cancelled'
  const file = new File([blob], `fathom-dive-${info.portName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`, { type: 'image/png' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: diveShareText(info), url: SITE_URL })
      return 'shared'
    } catch {
      return 'cancelled'
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
  return 'downloaded'
}

export function xShareUrl(info: DiveCardInfo): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(diveShareText(info))}&url=${encodeURIComponent(SITE_URL)}`
}
