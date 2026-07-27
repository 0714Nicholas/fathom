import './globals.css'
import type { Metadata, Viewport } from 'next'
import React from 'react'

export const viewport: Viewport = {
  themeColor: '#02050a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'Fathom',
  description:
    'Fathom — From the coastal noise to the hush of the deep, and the quiet resonance between us.',
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
      <body>{children}</body>
    </html>
  )
}
