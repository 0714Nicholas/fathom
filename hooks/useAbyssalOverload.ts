'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface UseAbyssalOverloadProps {
  onReleaseSuccess: () => void; // 成功時に深度を減らす処理などを親で呼ぶ
  chargeTimeRequired?: number;  // 必要な長押し時間（ミリ秒）デフォルト3000ms
}

export function useAbyssalOverload({ onReleaseSuccess, chargeTimeRequired = 3000 }: UseAbyssalOverloadProps) {
  const [isCharging, setIsCharging] = useState(false)
  const [chargeProgress, setChargeProgress] = useState(0) // 0.0 ~ 1.0
  const [turbidity, setTurbidity] = useState(0) // 0.0 ~ 1.0 (海の濁り)

  const chargeStartTime = useRef<number | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const releaseHistory = useRef<number[]>([]) // 直近のリリース時刻を保持

  // チャージ中のプログレス更新
  const updateCharge = useCallback(() => {
    if (!chargeStartTime.current) return
    const elapsed = performance.now() - chargeStartTime.current
    const progress = Math.min(elapsed / chargeTimeRequired, 1.0)
    setChargeProgress(progress)

    if (progress < 1.0) {
      animationFrameRef.current = requestAnimationFrame(updateCharge)
    }
  }, [chargeTimeRequired])

  const startCharge = useCallback(() => {
    if (turbidity > 0.8) return // 海が荒れすぎている時はチャージ不可（石化に近い状態）
    setIsCharging(true)
    chargeStartTime.current = performance.now()
    animationFrameRef.current = requestAnimationFrame(updateCharge)
  }, [updateCharge, turbidity])

  const stopCharge = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    setIsCharging(false)
    setChargeProgress(0)

    if (!chargeStartTime.current) return
    const elapsed = performance.now() - chargeStartTime.current
    chargeStartTime.current = null

    // 3秒以上チャージしていたら解放（Release）成功
    if (elapsed >= chargeTimeRequired) {
      const now = performance.now()
      releaseHistory.current.push(now)
      
      // 直近5分（300000ms）以内のリリース回数をカウント
      const recentReleases = releaseHistory.current.filter(t => now - t < 300000)
      releaseHistory.current = recentReleases

      // 3回以上連続で放つと海が荒れる（濁度MAX）
      if (recentReleases.length >= 3) {
        setTurbidity(1.0)
      }

      onReleaseSuccess()
    }
  }, [chargeTimeRequired, onReleaseSuccess])

  // 時間経過で濁り（Turbidity）を徐々に回復させる
  useEffect(() => {
    if (turbidity <= 0) return
    let lastTime = performance.now()
    let frameId: number

    const recover = (time: number) => {
      const delta = time - lastTime
      lastTime = time
      // 約60秒かけてゆっくり濁りが取れる
      setTurbidity(prev => Math.max(0, prev - (delta / 60000))) 
      frameId = requestAnimationFrame(recover)
    }
    frameId = requestAnimationFrame(recover)
    return () => cancelAnimationFrame(frameId)
  }, [turbidity])

  return {
    isCharging,
    chargeProgress,
    turbidity,
    startCharge,
    stopCharge
  }
}