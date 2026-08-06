'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// --- ユーティリティ ---
function hashCode(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

// 深海の「果てしない残響（洞窟の反響）」をプログラムで生成する
function createAbyssalReverb(ctx: AudioContext, duration: number = 4.0, decay: number = 3.0) {
  const length = ctx.sampleRate * duration
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) {
      // 指数関数的に減衰するノイズでインパルス応答をシミュレート
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
  }
  return buffer
}

export function useDeepSeaAudio(opts: { enabled: boolean, progress: number, windSpeed: number, rainAmount: number, descent: number }) {
  const ctxRef = useRef<AudioContext | null>(null)
  const [running, setRunning] = useState(false)
  
  const masterGainRef = useRef<GainNode | null>(null)
  const reverbNodeRef = useRef<ConvolverNode | null>(null)
  const reverbGainRef = useRef<GainNode | null>(null)
  
  const bgmFilterRef = useRef<BiquadFilterNode | null>(null)
  const bgmOscRef = useRef<OscillatorNode | null>(null)

  const initAudio = useCallback(() => {
    if (ctxRef.current) return
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    
    const ctx = new AudioContextClass()
    ctxRef.current = ctx

    // マスターゲイン
    const master = ctx.createGain()
    master.gain.value = 0.8
    master.connect(ctx.destination)
    masterGainRef.current = master

    // 🚨 3D空間リバーブの構築
    const reverb = ctx.createConvolver()
    reverb.buffer = createAbyssalReverb(ctx, 6.0, 4.0) // 6秒の長く冷たい残響
    reverbNodeRef.current = reverb

    const reverbGain = ctx.createGain()
    reverbGain.gain.value = 0.5 // 初期残響量
    reverb.connect(reverbGain)
    reverbGain.connect(master)
    reverbGainRef.current = reverbGain

    // 環境音（持続する重低音ノイズ）の初期化
    const bgmFilter = ctx.createBiquadFilter()
    bgmFilter.type = 'lowpass'
    bgmFilter.frequency.value = 100
    bgmFilter.connect(master)
    bgmFilterRef.current = bgmFilter

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 40
    osc.connect(bgmFilter)
    osc.start()
    bgmOscRef.current = osc

    setRunning(true)
  }, [])

  const resume = useCallback(async () => {
    if (!ctxRef.current) initAudio()
    if (ctxRef.current?.state === 'suspended') {
      await ctxRef.current.resume()
    }
    setRunning(true)
  }, [initAudio])

  const suspend = useCallback(async () => {
    if (ctxRef.current?.state === 'running') {
      await ctxRef.current.suspend()
    }
    setRunning(false)
  }, [])

  const start = resume

  // 深度（progress）に応じて環境音とリバーブ（空間の広がり）を変化させる
  useEffect(() => {
    if (!ctxRef.current || !bgmFilterRef.current || !reverbGainRef.current) return
    const ctx = ctxRef.current
    
    // 深く潜るほど、水圧でノイズが重くなり、残響（広がり）が深くなる
    const targetFreq = 100 + (1 - opts.progress) * 300
    bgmFilterRef.current.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 1.0)
    
    const targetReverb = 0.2 + (opts.progress * 0.9) // 深度100%で最強のリバーブ
    reverbGainRef.current.gain.setTargetAtTime(targetReverb, ctx.currentTime, 1.0)
  }, [opts.progress])

  // （既存）自分自身のUI操作音
  const triggerFrictionImpulse = useCallback((payload: { intensity: number, durationMs: number, color: number }) => {
    if (!ctxRef.current || !masterGainRef.current || !reverbNodeRef.current) return
    const ctx = ctxRef.current
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150 + payload.color * 200, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + payload.durationMs / 1000)
    
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(payload.intensity * 0.5, ctx.currentTime + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + payload.durationMs / 1000)
    
    osc.connect(gain)
    gain.connect(masterGainRef.current)
    gain.connect(reverbNodeRef.current) 
    
    osc.start()
    osc.stop(ctx.currentTime + payload.durationMs / 1000 + 0.1)
  }, [])

  // 🚨 新規追加：他者のソナー音を立体空間に配置する（Pitch + Pan + Filter + Reverb）
  const triggerSpatialResonance = useCallback((peerSeed: string, peerDepth: number, energy: number) => {
    if (!ctxRef.current || !masterGainRef.current || !reverbNodeRef.current) return 0
    const ctx = ctxRef.current

    const hash = hashCode(peerSeed)
    
    // 1. 【Voice (音色)】 Seedから固有の周波数を決定（100Hz〜350Hz）
    const baseFreq = 100 + (Math.abs(hash) % 250)

    // 2. 【Position (定位)】 Seedから左右の位置（Pan）を固定（-1.0〜1.0）
    const panValue = ((Math.abs(hash * 31) % 100) / 50) - 1.0
    const panner = ctx.createStereoPanner()
    panner.pan.value = panValue

    // 3. 【Water Pressure (水圧)】 相手との「深度差」で音のくぐもりを計算
    const depthDiff = peerDepth - opts.progress 
    let cutoff = 3000
    if (depthDiff > 0) {
      // 相手が自分より「深い」場合：高音域が削られ、重く鈍い音になる
      cutoff = Math.max(150, 3000 - (depthDiff * 5000)) 
    } else if (depthDiff < 0) {
      // 相手が自分より「浅い」場合：少し高音域が抜ける
      cutoff = Math.min(5000, 3000 + (Math.abs(depthDiff) * 3000))
    }
    
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    filter.Q.value = 2.0 // レゾナンスを少し強めにして「水中の反響感」を出す

    // 音源の生成
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.type = 'sine'
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime)
    // ソナー特有の「ピォォォン…」という下降フォールを付ける
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, ctx.currentTime + 1.2)
    
    // 音量エンベロープ（ぽわん、と鳴って消える）
    const maxVol = Math.max(0.1, Math.min(0.8, energy))
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(maxVol, ctx.currentTime + 0.1)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5)
    
    // ルーティング: Osc -> Gain -> Filter(水圧) -> Panner(定位)
    osc.connect(gain)
    gain.connect(filter)
    filter.connect(panner)
    
    // マスター出力へ
    panner.connect(masterGainRef.current)
    
    // 🚨 洞窟のリバーブ（残響）空間にも音波を流し込む
    const sendToReverb = ctx.createGain()
    sendToReverb.gain.value = 0.9 // 残響へのセンド量
    panner.connect(sendToReverb)
    sendToReverb.connect(reverbNodeRef.current)

    // 発音
    osc.start()
    osc.stop(ctx.currentTime + 3.0)

    // 視覚エフェクト（画面のフチの光）と連動させるため、計算したPan値を返す
    return panValue
  }, [opts.progress])

  return {
    running,
    start,
    resume,
    suspend,
    triggerFrictionImpulse,
    triggerSpatialResonance,
  }
}