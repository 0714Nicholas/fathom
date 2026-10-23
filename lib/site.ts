import { PORTS } from '@/lib/scene/ports'

// 独自ドメインに移したら Vercel の環境変数 NEXT_PUBLIC_SITE_URL を設定する
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fathom-sandy.vercel.app').replace(/\/$/, '')

export const SITE_NAME = 'Fathom'

export const SITE_TITLE = 'Fathom — 深海に潜る集中・瞑想・睡眠タイマー'

export const SITE_TAGLINE = '世界の果ての「いま」の天気が、深海の景色を変える。'

export const SITE_DESCRIPTION = `世界の果て${PORTS.length}の海の「いま」の天気が、深海の景色を変える。集中90分・瞑想25分・睡眠60分の没入型タイマー。音はすべてブラウザでリアルタイム生成、登録不要。`
