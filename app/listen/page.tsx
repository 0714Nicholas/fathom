import type { Metadata } from 'next'
import { ListenTest } from '@/components/ListenTest'

// 「何の音か」を言わずに友達に聞いてもらう試聴ページ。
// タブの名前や LINE のリンク表示から、海やアプリの名前が分からないようにする
const TITLE = '試聴'
const DESCRIPTION = 'イヤホンをつけて、3分ほど聞いてください。'

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  applicationName: null,
  keywords: null,
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  openGraph: { type: 'website', title: TITLE, description: DESCRIPTION },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
  appleWebApp: { title: TITLE },
}

export default function ListenPage() {
  return <ListenTest />
}
