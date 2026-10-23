import './globals.css'
import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import React from 'react'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from '@/lib/site'

const isProduction = process.env.NODE_ENV === 'production'

export const viewport: Viewport = {
  themeColor: '#02050a',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    '集中タイマー',
    '瞑想タイマー',
    '睡眠タイマー',
    'ポモドーロ',
    '環境音',
    'ホワイトノイズ',
    '作業用BGM',
    'focus timer',
    'ambient sound',
    'deep sea',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: '/',
    locale: 'ja_JP',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  appleWebApp: {
      capable: true,
      title: 'FATHOM',
      statusBarStyle: 'black-translucent', // ステータスバーを透明・黒背景にする
  },
    formatDetection: {
      telephone: false,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body>
        {children}
        <ServiceWorkerRegister />
        {/* Vercel Web Analytics（ダッシュボードで Analytics を有効にすると計測が始まる） */}
        {isProduction ? (
          <>
            <Script id="vercel-analytics-queue" strategy="afterInteractive">
              {'window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };'}
            </Script>
            <Script src="/_vercel/insights/script.js" strategy="afterInteractive" />
          </>
        ) : null}
      </body>
    </html>
  )
}
