'use client'

import { Canvas } from '@react-three/fiber'
import { CrystalCoral } from './CrystalCoral'

export interface DeepSeaCanvasProps {
  progress?: number
  windSpeed?: number
  clouds?: number
  rainAmount?: number
  temp?: number
  
  // 記憶・セッション関連
  diveTimeMs?: number
  releaseCount?: number
  sessionPhase?: string
  descent?: number
  isSuspended?: boolean
  
  // Fathomのアイデンティティ・通信関連
  identity?: any
  resonancePulse?: number
  resonanceEnergy?: number
  heatmapPulse?: any
  
  // 新機能：アビサル・オーバーロード（長押しチャージ）関連
  isCharging?: boolean
  turbidity?: number
  onChargeStart?: () => void
  onChargeStop?: () => void
}

export function DeepSeaCanvas(props: DeepSeaCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4], fov: 45 }}
      dpr={[1, 2]} // デバイスのピクセル比に応じた解像度最適化
      gl={{ antialias: true, alpha: true }}
    >
      {/* 
        受け取ったすべてのPropsをそのまま CrystalCoral にパス（バケツリレー）します。
        これにより、CrystalCoral 内部のシェーダーでこれらの値を利用できるようになります。
      */}
      <CrystalCoral {...props} />
    </Canvas>
  )
}