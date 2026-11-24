import { ImageResponse } from 'next/og'

// 試聴ページを LINE などで送ったときのカード画像。海やアプリの名前が分からない、無地の画像にする
export const alt = '試聴'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function ListenOpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#111111',
          color: '#dddddd',
          fontSize: 64,
          letterSpacing: '0.3em',
        }}
      >
        LISTEN
      </div>
    ),
    size,
  )
}
