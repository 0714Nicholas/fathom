import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LEGAL, LEGAL_READY } from '@/lib/legal'

export const metadata: Metadata = {
  title: '特定商取引法に基づく表記',
  robots: { index: false },
}

const rows = (): [string, string][] => [
  ['販売事業者', LEGAL.sellerName],
  ['運営責任者', LEGAL.representative],
  ['所在地', LEGAL.address],
  ['電話番号', LEGAL.phone],
  ['メールアドレス', LEGAL.email],
  ['販売価格', '購入ページに表示（¥100〜、お客様が金額を選べます）'],
  ['商品代金以外の必要料金', 'なし（インターネット接続にかかる通信料はお客様のご負担です）'],
  ['支払方法', 'クレジットカードなど、Stripe が提供する決済方法'],
  ['支払時期', 'ご購入時にお支払いが確定します'],
  ['提供時期', '決済完了後ただちに（Fathom の運営を応援するデジタルの応援購入です）'],
  ['返品・キャンセル', '性質上、購入後の返品・返金はお受けしておりません'],
  ['動作環境', '最新版の Chrome・Safari・Edge・Firefox'],
]

export default function LegalPage() {
  if (!LEGAL_READY) notFound()

  return (
    <main style={{ minHeight: '100vh', background: '#02050a', color: 'rgba(235, 245, 252, 0.9)', padding: '64px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 400, letterSpacing: '0.1em', marginBottom: 32 }}>特定商取引法に基づく表記</h1>
        <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 200px) 1fr', gap: '16px 24px', fontSize: 14, lineHeight: 1.8 }}>
          {rows().map(([label, value]) => (
            <div key={label} style={{ display: 'contents' }}>
              <dt style={{ color: 'rgba(235, 245, 252, 0.55)' }}>{label}</dt>
              <dd style={{ margin: 0 }}>{value}</dd>
            </div>
          ))}
        </dl>
        <p style={{ marginTop: 48, fontSize: 13 }}>
          <a href="/" style={{ color: '#8fd8ff' }}>← Fathom に戻る</a>
        </p>
      </div>
    </main>
  )
}
