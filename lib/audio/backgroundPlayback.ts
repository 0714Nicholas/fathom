import { SITE_NAME } from '@/lib/site'

// iPhone のブラウザは、画面を消すと Web Audio の音を止めてしまう。
// 音楽アプリと同じ扱いにしてもらうため、次の 3 つをそろえる。
//   1. audioSession を playback にする（消音スイッチがオンでも鳴る）
//   2. 無音の <audio> をループ再生して、再生中のページとして保つ
//   3. Media Session でロック画面の表示と再生・一時停止に対応する

type PlaybackHandlers = {
  onPlay: () => void
  onPause: () => void
}

let keepAlive: HTMLAudioElement | null = null

// 1 秒の無音 WAV（8kHz・16bit・モノラル）
function createSilentWavUrl(): string {
  const sampleRate = 8000
  const dataSize = sampleRate * 2
  const view = new DataView(new ArrayBuffer(44 + dataSize))
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // モノラル
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, dataSize, true)

  return URL.createObjectURL(new Blob([view.buffer], { type: 'audio/wav' }))
}

function getKeepAlive(): HTMLAudioElement {
  if (!keepAlive) {
    keepAlive = new Audio(createSilentWavUrl())
    keepAlive.loop = true
    keepAlive.hidden = true
    keepAlive.dataset.role = 'background-keep-alive'
    document.body.appendChild(keepAlive)
  }
  return keepAlive
}

// iPhone では、ボタンを押した処理の中で（await より前に）呼ぶ必要がある
export function startBackgroundPlayback(handlers: PlaybackHandlers) {
  const audioSession = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (audioSession) {
    try { audioSession.type = 'playback' } catch { /* 対応していないブラウザでは何もしない */ }
  }

  getKeepAlive().play().catch(() => { /* 再生できなくても画面が表示中なら音は鳴る */ })

  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'playing'
    navigator.mediaSession.setActionHandler('play', handlers.onPlay)
    navigator.mediaSession.setActionHandler('pause', handlers.onPause)
  }
}

export function pauseBackgroundPlayback() {
  keepAlive?.pause()
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
}

// 電話などで止まったあと、画面に戻ったときに再生を戻す
export function restoreBackgroundPlayback() {
  if (keepAlive?.paused) keepAlive.play().catch(() => { /* 次の操作で再開できる */ })
}

export function setNowPlaying(title: string) {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist: SITE_NAME,
    artwork: [{ src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' }],
  })
}
