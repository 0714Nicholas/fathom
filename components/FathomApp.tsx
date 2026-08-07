'use client'

import { useState, useEffect } from 'react'
import { DeepSeaCanvas } from '@/components/scene/DeepSeaCanvas'
import { useDeepSeaAudio } from '@/hooks/useDeepSeaAudio'
import { useFathomMemory } from '@/hooks/useFathomMemory'
import { useAbyssalOverload } from '@/hooks/useAbyssalOverload' // 前回作ったフック

export default function FathomApp() {
  // --- 状態管理 ---
  const [progress, setProgress] = useState(0) 
  const [isAudioEnabled, setIsAudioEnabled] = useState(false)
  const [resonancePulse, setResonancePulse] = useState(0)

  // (天候データは既存の useWeather 等があればそれに置き換えてください)
  const windSpeed = 5
  const clouds = 50
  const rainAmount = 0
  const temp = 15

  // --- フック群 ---
  // 1. 記憶（Karma）の管理
  const { diveTimeMs, releaseCount, incrementRelease, isLoaded } = useFathomMemory(true)

  // 2. 🚨 新機能：沈黙の飽和と解放（チャージ）の管理
  const { isCharging, turbidity, startCharge, stopCharge } = useAbyssalOverload({
    chargeTimeRequired: 3000, // 3秒長押しで解放
    onReleaseSuccess: () => {
      // 代償①：深度を強制的に浅くする（リコイル）
      setProgress(prev => Math.max(0, prev - 0.08))
      
      // 業（Karma）を蓄積
      incrementRelease()
      
      // ソナー音を鳴らす
      audio.triggerOverloadSonar()
      
      // 光の波紋（フラッシュ）を発生させる
      setResonancePulse(Date.now())
    }
  })

  // 3. オーディオエンジン（チャージと濁度を連携）
  const audio = useDeepSeaAudio({
    enabled: isAudioEnabled,
    progress,
    descent: 0, 
    windSpeed,
    rainAmount,
    isCharging, // 連携
    turbidity   // 連携
  })

  // --- 自動潜行ロジック（例） ---
  useEffect(() => {
    const timer = setInterval(() => {
      // 少しずつ深く潜っていく（代償の8%喪失とバランスを取るスピードに調整）
      setProgress(p => Math.min(1, p + 0.005))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const handleEnableAudio = () => {
    setIsAudioEnabled(true)
    audio.start()
  }

  // =========================================================================
  // 🚨 UIレンダー部：過去のテキストフォームや手紙通信を「全削除」し、最小限に。
  // =========================================================================
  return (
    <div className="relative w-screen h-screen bg-[#02050A] text-[#8fd8ff] font-mono overflow-hidden flex flex-col">
      
      {/* --- WebGL Canvas（クリスタル） --- */}
      <div className="absolute inset-0 z-0">
        <DeepSeaCanvas
          progress={progress}
          windSpeed={windSpeed}
          clouds={clouds}
          rainAmount={rainAmount}
          temp={temp}
          diveTimeMs={diveTimeMs}
          releaseCount={releaseCount}
          resonancePulse={resonancePulse}
          isCharging={isCharging}
          turbidity={turbidity}
          onChargeStart={startCharge}
          onChargeStop={stopCharge}
        />
      </div>

      {/* --- HUD (UI Layer) --- */}
      {/* pointer-events-none で、クリスタルへのタッチを邪魔しないようにする */}
      <div className="relative z-10 w-full h-full pointer-events-none p-6 flex flex-col justify-between">
        
        {/* Header */}
        <div className="flex justify-between items-start opacity-70 text-xs">
          <div>
            <p>[ SURFACE ]</p>
            <p>Origin: Anonymous Tide</p>
            <p>Surface Noise: {windSpeed} m/s</p>
            <p>Surface Temp: {temp}°C</p>
          </div>
          <div>
            <h1 className="tracking-[0.5em] text-center text-sm">F A T H O M</h1>
          </div>
          {/* 右上のUI（手紙や共鳴待ち）は削除し、空白を保つ */}
          <div className="w-32"></div> 
        </div>

        {/* Footer */}
        <div className="flex justify-between items-end opacity-70 text-xs">
          <div>
            <p>[ ABYSS ]</p>
            <p>Current Depth: {Math.round(progress * 100)}%</p>
            <p>Pressure: {(1 + progress * 9.9).toFixed(2)} atm</p>
            <br />
            <p>[ MEMORY ]</p>
            <p>Age: {Math.floor(diveTimeMs / 1000)} fth</p>
            <p>Releases: {releaseCount}</p>
          </div>
          
          {/* Audio Start Button */}
          {!isAudioEnabled && (
            <div className="pointer-events-auto">
              <button 
                onClick={handleEnableAudio}
                className="border border-[#8fd8ff] px-4 py-2 hover:bg-[#8fd8ff] hover:text-black transition-colors"
              >
                [ START DIVE ]
              </button>
            </div>
          )}

          <div className="text-right opacity-50">
            {turbidity > 0.8 ? (
              <p className="animate-pulse text-red-400">Turbulence detected. Please wait.</p>
            ) : (
              <p>Press and hold the crystal to release...</p>
            )}
          </div>
        </div>
        
        {/* 🚨 下部にあった <form> のテキスト入力ボックスは完全に消滅しました */}
      </div>
    </div>
  )
}