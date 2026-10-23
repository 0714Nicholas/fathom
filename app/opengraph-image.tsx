import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { PORTS } from '@/lib/scene/ports'
import { SITE_TITLE } from '@/lib/site'

// SNS でシェアされたときのカード画像（ビルド時に一度だけ生成される）
export const alt = SITE_TITLE
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpengraphImage() {
  const mincho = await readFile(join(process.cwd(), 'public/fonts/ShipporiMincho-Regular.ttf'))

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '0 96px',
          gap: 80,
          color: '#eaf6ff',
          fontFamily: 'Shippori Mincho',
          backgroundColor: '#02050a',
          backgroundImage:
            'radial-gradient(circle at 26% 50%, rgba(27, 73, 102, 0.55) 0%, rgba(7, 16, 24, 0.9) 38%, #02050a 70%)',
        }}
      >
        <div
          style={{
            width: 340,
            height: 340,
            flexShrink: 0,
            borderRadius: 9999,
            backgroundImage:
              'radial-gradient(circle at 34% 28%, rgba(220, 244, 255, 0.95) 0%, rgba(143, 216, 255, 0.55) 9%, rgba(36, 104, 156, 0.75) 32%, rgba(8, 30, 52, 0.95) 64%, #02050a 100%)',
            boxShadow: '0 0 140px rgba(143, 216, 255, 0.28)',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, letterSpacing: '0.6em', color: 'rgba(255, 255, 255, 0.6)' }}>
            F A T H O M
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 36, fontSize: 54, lineHeight: 1.45 }}>
            <span>世界の果ての「いま」が、</span>
            <span>深海の景色になる。</span>
          </div>
          <div style={{ marginTop: 28, fontSize: 28, color: 'rgba(235, 245, 252, 0.72)' }}>
            集中・瞑想・睡眠のための没入型タイマー
          </div>
          <div style={{ marginTop: 40, fontSize: 16, letterSpacing: '0.14em', color: 'rgba(143, 216, 255, 0.7)' }}>
            {`LIVE WEATHER FROM ${PORTS.length} REMOTE SEAS · NO SIGN-UP`}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Shippori Mincho', data: mincho, style: 'normal', weight: 400 }],
    }
  )
}
