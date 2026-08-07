'use client'

import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { CrystalCoral } from './CrystalCoral'
import { MarineSnow } from './MarineSnow'
// 🚨 エラーの原因だった ResonanceField のインポートを一時的に停止
// import { ResonanceField } from './ResonanceField'
import { ResonanceHeatmap } from './ResonanceHeatmap'

export interface DeepSeaCanvasProps {
  progress?: number
  windSpeed?: number
  clouds?: number
  rainAmount?: number
  temp?: number
  diveTimeMs?: number
  releaseCount?: number
  sessionPhase?: string
  descent?: number
  isSuspended?: boolean
  identity?: any
  resonancePulse?: number
  resonanceEnergy?: number
  heatmapPulse?: any
  isCharging?: boolean
  turbidity?: number
  onChargeStart?: () => void
  onChargeStop?: () => void
}

export function DeepSeaCanvas(props: DeepSeaCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.5], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, stencil: false, depth: false }}
    >
      {/* 深海のベース空間（奥行きと霞み） */}
      <color attach="background" args={['#02050a']} />
      <fog attach="fog" args={['#02050a', 3, 10]} />

      <Suspense fallback={null}>
        {/* メインの結晶（長押し判定を含む） */}
        <CrystalCoral {...props} />
        
        {/* 手前のマリンスノー */}
        <MarineSnow 
          variant="near" 
          progress={props.progress || 0} 
          descent={props.descent || 0} 
          windSpeed={props.windSpeed || 0} 
          rainAmount={props.rainAmount || 0}
          clouds={props.clouds || 0} 
        />
        {/* 奥のマリンスノー（物理法則に従って潜行時は上がり、停止時は舞い落ちる） */}
        <MarineSnow 
          variant="far" 
          progress={props.progress || 0} 
          descent={props.descent || 0} 
          windSpeed={props.windSpeed || 0} 
          rainAmount={props.rainAmount || 0}
          clouds={props.clouds || 0} 
        />
        
        {/* 🚨 ResonanceField はファイル破損のため一時的に非表示 */}
        {/* <ResonanceField 
          resonancePulse={props.resonancePulse || 0} 
          resonanceEnergy={props.resonanceEnergy || 0} 
        /> */}

        {/* ヒートマップエフェクト */}
        <ResonanceHeatmap 
          latestPulse={props.heatmapPulse} 
          progress={props.progress || 0} 
          descent={props.descent || 0} 
        />
      </Suspense>
    </Canvas>
  )
}