'use client'

import { Canvas } from '@react-three/fiber'
import { CrystalCoral } from './CrystalCoral'

export interface DeepSeaCanvasProps {
  progress?: number
  windSpeed?: number
  clouds?: number
  rainAmount?: number
  resonancePulse?: number
  temp?: number
  diveTimeMs?: number
  releaseCount?: number
  isCharging?: boolean
  turbidity?: number
  onChargeStart?: () => void
  onChargeStop?: () => void
}

export function DeepSeaCanvas(props: DeepSeaCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4], fov: 45 }}
      dpr={[1, 2]} // 解像度の最適化
      gl={{ antialias: true, alpha: true }}
    >
      <CrystalCoral {...props} />
    </Canvas>
  )
}