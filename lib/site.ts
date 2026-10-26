import { PORTS } from '@/lib/scene/ports'

// 独自ドメインに移したら Vercel の環境変数 NEXT_PUBLIC_SITE_URL を設定する
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fathom-sandy.vercel.app').replace(/\/$/, '')

export const SITE_NAME = 'Fathom'

export const SITE_TITLE = 'Fathom — 世界の果ての海に、みんなで潜る集中タイマー'

export const SITE_TAGLINE = '世界の果ての「いま」の天気が、深海の景色と音を変える。'

export const SITE_DESCRIPTION = `毎時 :00 と :30 に、世界の果て${PORTS.length}の海の「いま」へみんなで25分潜る、ポモドーロ式の集中タイマー。風・雨・気温で変わる深海の音はすべてブラウザで生成。登録不要。`
