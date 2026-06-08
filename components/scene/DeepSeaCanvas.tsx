'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CrystalCoral } from './CrystalCoral'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

function MarineSnow({ count = 1200, windSpeed = 0 }) {
  const pointsRef = useRef<THREE.Points>(null)
  
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

  const { viewport } = useThree()
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uWind: { value: windSpeed },
    uDpr: { value: dpr }
  }), [windSpeed, dpr])

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uWind.value = windSpeed
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} args={[positions, 3]} />
        <bufferAttribute attach="attributes-aScale" count={count} array={scales} itemSize={1} args={[scales, 1]} />
        <bufferAttribute attach="attributes-aSpeed" count={count} array={speeds} itemSize={1} args={[speeds, 1]} />
      </bufferGeometry>
      <shaderMaterial
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
          varying float vAlpha;
          void main() {
            vec3 pos = position;
            // ゆっくりとした上昇
            pos.y += uTime * aSpeed * 0.8;
            // 有機的な揺らぎ（横方向）
            pos.x += sin(uTime * aSpeed * 12.0 + pos.y * 3.0) * 0.15;
            // 浮き沈みの動き（縦方向）
            pos.y += sin(uTime * aSpeed * 8.0 + pos.x * 2.0) * 0.1;

            // 画面外に出たらループ
            pos.y = mod(pos.y + 10.0, 20.0) - 10.0;
            pos.x = mod(pos.x + 10.0, 20.0) - 10.0;
            
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            
            // サイズのベース数値を40.0から「150.0」に大幅アップ。さらに最低サイズ(3.0)を保証
            gl_PointSize = max((150.0 * aScale * uDpr) / -mvPosition.z, 3.0);
            
            // 明滅のベース透明度を上げ、ハッキリ見えるように
            vAlpha = 0.5 + 0.5 * sin(uTime * aSpeed * 15.0 + pos.x * 10.0);
          }
        `}
        fragmentShader={`
          varying float vAlpha;
          void main() {
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;
            // 減衰を弱め、中心がよりクッキリ発光するように
            float alpha = smoothstep(0.5, 0.2, dist) * vAlpha;
            // 少し白っぽく（明るく）して目立たせる
            gl_FragColor = vec4(0.8, 0.95, 1.0, alpha);
          }
        `}
      />
    </points>
  )
}

interface DeepSeaCanvasProps {
  progress: number
  windSpeed: number
  rainAmount: number
  clouds: number
  resonancePulse: number
  resonanceEnergy: number
  identity: any
  heatmapPulse: any
  descent: number
}

export function DeepSeaCanvas(props: DeepSeaCanvasProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      <Canvas camera={{ position: [0, 0, 4], fov: 45 }}>
        <color attach="background" args={['#030816']} />
        <fog attach="fog" args={['#030816', 3, 15]} />
        
        <MarineSnow windSpeed={props.windSpeed} count={1200} />
        <CrystalCoral {...props} />
      </Canvas>
    </div>
  )
}