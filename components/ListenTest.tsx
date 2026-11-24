'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_MASTER_VOLUME, useDeepSeaAudio } from '@/hooks/useDeepSeaAudio'

// 試聴の長さ。実際の潜航（25 分）の、浅いところから深いところまでを 3 分に縮めて聞いてもらう
const LISTEN_MS = 3 * 60 * 1000
const FADE_MS = 4000
const DEPTH_FROM = 0.15
const DEPTH_TO = 0.85
// 聞く人によって音が変わらないよう、天気は固定する（少し風があって曇り、雨なし）
const WEATHER = { windSpeed: 6, rainAmount: 0, snowAmount: 0, clouds: 65, temp: 9 }

type Phase = 'ready' | 'playing' | 'done'

function formatLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * 「何の音か」を言わずに聞いてもらう試聴ページ。画面は無地で、海を思わせるものは出さない。
 * - /listen      … いつもの音（鯨や泡などの生き物の音あり）
 * - /listen?v=b  … 生き物の音を外した版（リンクを見ても中身が分からないよう、記号だけにする）
 * 質問は聞き終わってから出す（先に見せると、答えを探しながら聞いてしまう）
 */
export function ListenTest() {
  const [variant, setVariant] = useState<'a' | 'b'>('a')
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('v') === 'b') setVariant('b')
  }, [])

  const [phase, setPhase] = useState<Phase>('ready')
  const [elapsed, setElapsed] = useState(0)
  const startedAtRef = useRef(0)

  const audio = useDeepSeaAudio({
    enabled: true,
    progress: DEPTH_FROM + (DEPTH_TO - DEPTH_FROM) * Math.min(1, elapsed / LISTEN_MS),
    ...WEATHER,
    descent: 0,
    focusMix: true,
    diveFraction: null,
    creatures: variant === 'a',
  })
  const { resume, suspend, setVolume } = audio

  // iPhone では、ボタンを押した処理の中で音を始める必要がある
  const start = useCallback(() => {
    setVolume(DEFAULT_MASTER_VOLUME)
    void resume()
    // ロック画面に、アプリの名前や絵が出ないようにする
    if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({ title: '試聴' })
    }
    startedAtRef.current = Date.now()
    setElapsed(0)
    setPhase('playing')
  }, [resume, setVolume])

  const stop = useCallback(() => {
    void suspend()
    setElapsed(0)
    setPhase('ready')
  }, [suspend])

  useEffect(() => {
    if (phase !== 'playing') return
    const id = window.setInterval(() => {
      const t = Date.now() - startedAtRef.current
      setElapsed(t)
      // 最後はゆっくり小さくして終える（ぷつっと切れないように）
      const left = LISTEN_MS - t
      if (left < FADE_MS) setVolume(DEFAULT_MASTER_VOLUME * Math.max(0, left / FADE_MS))
      if (left <= 0) {
        void suspend()
        setPhase('done')
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [phase, setVolume, suspend])

  return (
    <main style={styles.main}>
      <div style={styles.column}>
        {phase === 'ready' ? (
          <>
            <p style={styles.text}>イヤホンをつけて、静かなところで聞いてください。</p>
            <p style={styles.sub}>約3分です。途中で画面を消しても止まりません。</p>
            <button type="button" style={styles.button} onClick={start}>再生</button>
          </>
        ) : null}

        {phase === 'playing' ? (
          <>
            <p style={styles.text}>再生中</p>
            <p style={styles.sub}>残り {formatLeft(LISTEN_MS - elapsed)}</p>
            <button type="button" style={styles.button} onClick={stop}>止める</button>
          </>
        ) : null}

        {phase === 'done' ? (
          <>
            <p style={styles.text}>聞いてくれてありがとうございました。</p>
            <p style={styles.sub}>送ってくれた人に、次の3つを教えてください。</p>
            <ol style={styles.list}>
              <li>何の音に聞こえましたか？</li>
              <li>どんな場所で流れていたら合うと思いますか？</li>
              <li>落ち着きましたか？落ち着かないところはありましたか？</li>
            </ol>
            <button type="button" style={styles.button} onClick={start}>もう一度聞く</button>
          </>
        ) : null}
      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    background: '#111111',
    color: '#dddddd',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 16px',
    fontFamily: 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif',
  },
  column: { width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' },
  text: { margin: 0, fontSize: 16, lineHeight: 1.7 },
  sub: { margin: 0, fontSize: 13, lineHeight: 1.7, color: '#999999' },
  list: { margin: 0, paddingLeft: 20, textAlign: 'left', fontSize: 14, lineHeight: 2 },
  button: {
    marginTop: 8,
    minWidth: 160,
    padding: '12px 24px',
    fontSize: 15,
    color: '#dddddd',
    background: 'transparent',
    border: '1px solid #555555',
    borderRadius: 999,
    cursor: 'pointer',
  },
}
