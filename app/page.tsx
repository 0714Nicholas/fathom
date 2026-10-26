import { FathomApp } from '@/components/FathomApp'
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from '@/lib/site'

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: SITE_NAME,
  alternateName: SITE_TITLE,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'Web',
  inLanguage: 'ja',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
}

export default function Page() {
  return (
    <>
      {/* 検索エンジンとスクリーンリーダー向けの説明（画面上は 3D シーンが主役） */}
      <div className="sr-only">
        <h1>{SITE_TITLE}</h1>
        <p>{SITE_DESCRIPTION}</p>
        <p>
          定時潜航では、毎時 :00 と :30 に全員で同じ海へ25分潜り、5分浮上して休憩します。潜る海は1時間ごとに変わります。
          途中からの合流もでき、ソロ潜航では好きな海を選んで瞑想・睡眠・90分の集中にも使えます。
          現地の風・雨・気温・雲の実データが深海の音と映像に反映され、音はブラウザ上でリアルタイムに生成されます。
        </p>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <FathomApp />
    </>
  )
}
