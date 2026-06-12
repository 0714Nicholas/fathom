'use client'

import { useState, useEffect, useCallback } from 'react'

export function useFathomMemory(isDiving: boolean) {
  const [memory, setMemory] = useState({ diveTimeMs: 0, releaseCount: 0 })

  // 初回マウント時にローカルストレージから記憶を読み込む
  useEffect(() => {
    const stored = localStorage.getItem('fathom:memory')
    if (stored) {
      try {
        setMemory(JSON.parse(stored))
      } catch (e) {}
    }
  }, [])

  // 記憶が更新されたら、5秒ごとにローカルストレージに自動保存
  useEffect(() => {
    const interval = setInterval(() => {
      localStorage.setItem('fathom:memory', JSON.stringify(memory))
    }, 5000)
    return () => clearInterval(interval)
  }, [memory])

  // 潜水中（オーディオが動いている間）のみ、時間を計測する
  useEffect(() => {
    if (!isDiving) return
    const interval = setInterval(() => {
      setMemory(prev => ({ ...prev, diveTimeMs: prev.diveTimeMs + 1000 }))
    }, 1000)
    return () => clearInterval(interval)
  }, [isDiving])

  // 思考を放流した時にカウントアップする関数
  const incrementRelease = useCallback(() => {
    setMemory(prev => {
      const next = { ...prev, releaseCount: prev.releaseCount + 1 }
      localStorage.setItem('fathom:memory', JSON.stringify(next))
      return next
    })
  }, [])

  return { ...memory, incrementRelease }
}