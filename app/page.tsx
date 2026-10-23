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
          ダイヤルで観測地点を選び、Meditate（25分＋5分）・Focus（90分）・Sleep（60分）から
          モードを選んで descend を押すと潜航が始まります。現地の風・気温・雲の実データが深海の映像に反映され、
          音はブラウザ上でリアルタイムに生成されます。
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
