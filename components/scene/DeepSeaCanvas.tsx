'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CrystalCoral } from './CrystalCoral'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

// 🚨 修正：progress（水深）を受け取るように変更
function MarineSnow({ count = 1200, windSpeed = 0, progress = 0 }) {
  const pointsRef = useRef<THREE.Points>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null) // 🚨 時間停止バグ修正用
  
  const [positions, scales, speeds] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const sca = new Float32Array(count)
    const spd = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20
      pos[i * 3 + 2] = (Math.random() - 0.5) * 15 - 2
      sca[i] = Math.random() * 0.5 + 0.1
      spd[i] = Math.random() * 0.02 + 0.01
    }
    return [pos, sca, spd]
  }, [count])

  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uWind: { value: 0 },
    uDpr: { value: dpr },
    uProgress: { value: 0 } // 🚨 水深データをシェーダーに渡す
  }), [dpr])

  useFrame((state) => {
    // 🚨 修正：ここで毎フレーム直接数値を流し込むことで、バグなくアニメーションする
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
      materialRef.current.uniforms.uWind.value = windSpeed
      materialRef.current.uniforms.uProgress.value = progress
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} args={[positions, 3]} />
        <bufferAttribute attach="attributes-aScale" count={count} array={scales} itemSize={1} args={[scales, 1]} />
        <bufferAttribute attach="attributes-aSpeed" count={count} array={speeds} itemSize={1} args={[speeds, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={uniforms}
        vertexShader={`
          attribute float aScale;
          attribute float aSpeed;
          uniform float uTime;
          uniform float uWind;
          uniform float uDpr;
          uniform float uProgress;
          varying float vAlpha;
          void main() {
            vec3 pos = position;
            
            // 🚨 水深（uProgress）が深いほど、全体の動きが重く、遅くなる（最大80%減速）
            float depthSpeedMult = 1.0 - (uProgress * 0.8);
            
            pos.y += uTime * aSpeed * 0.8 * depthSpeedMult;
            pos.x += sin(uTime * aSpeed * 12.0 + pos.y * 3.0) * 0.15 * depthSpeedMult;
            pos.y += sin(uTime * aSpeed * 8.0 + pos.x * 2.0) * 0.1 * depthSpeedMult;

            pos.y = mod(pos.y + 10.0, 20.0) - 10.0;
            pos.x = mod(pos.x + 10.0, 20.0) - 10.0;
            
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            
            gl_PointSize = max((150.0 * aScale * uDpr) / -mvPosition.z, 3.0);
            
            // 深海に潜るほど、明滅がゆっくりになる
            vAlpha = 0.5 + 0.5 * sin(uTime * aSpeed * 15.0 * depthSpeedMult + pos.x * 10.0);
          }
        `}
        fragmentShader={`
          varying float vAlpha;
          uniform float uProgress;
          void main() {
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;
            float alpha = smoothstep(0.5, 0.2, dist) * vAlpha;
            
            // 🚨 水深が深いほど、パーティクルの透明度が下がり「暗闇に溶ける」
            float depthDim = 1.0 - (uProgress * 0.7);
            gl_FragColor = vec4(0.8, 0.95, 1.0, alpha * depthDim);
          }
        `}
      />
    </points>
  )
}

// 🚨 修正：temp（気温）を受け取れるようにPropsを追加
export interface DeepSeaCanvasProps {
  progress: number
  windSpeed: number
  rainAmount: number
  clouds: number
  resonancePulse: number
  resonanceEnergy: number
  identity: any
  heatmapPulse: any
  descent: number
  temp?: number
}

export function DeepSeaCanvas(props: DeepSeaCanvasProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      <Canvas camera={{ position: [0, 0, 4], fov: 45 }}>
        <color attach="background" args={['#030816']} />
        <fog attach="fog" args={['#030816', 3, 15]} />
        
        <MarineSnow windSpeed={props.windSpeed} count={1200} progress={props.progress} />
        <CrystalCoral {...props} />
      </Canvas>
    </div>
  )
}