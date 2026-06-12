'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CrystalCoral } from './CrystalCoral'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

// 🚨 修正：sessionPhase を受け取るように追加
function MarineSnow({ count = 1200, windSpeed = 0, progress = 0, isSuspended = false, descent = 1, sessionPhase = 'diving' }) {
  const pointsRef = useRef<THREE.Points>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  
  const scrollYRef = useRef(0)
  const currentSpeedRef = useRef(1.5) 
  
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
    uProgress: { value: 0 },
    uScrollY: { value: 0 } 
  }), [dpr])

  useFrame((state, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
      materialRef.current.uniforms.uWind.value = windSpeed
      materialRef.current.uniforms.uProgress.value = progress

      // 🚨 修正：フェーズに合わせた物理的な上下移動
      let targetSpeed = -0.15; // デフォルト：漂流（完了後）

      if (isSuspended) {
        targetSpeed = -0.05; // サスペンド中はほぼ停止
      } else if (descent < 1.0) {
        targetSpeed = 2.0; // 最初の8秒のダイブ（雪が猛スピードで上に飛ぶ）
      } else if (sessionPhase === 'diving') {
        targetSpeed = 0.4; // 潜行中（雪がゆっくり上に飛ぶ＝自分が沈んでいる）
      } else if (sessionPhase === 'interval') {
        targetSpeed = -1.5; // 減圧・浮上中（雪が猛スピードで下に飛ぶ＝自分が浮上している）
      }

      currentSpeedRef.current = THREE.MathUtils.lerp(
        currentSpeedRef.current,
        targetSpeed,
        delta * 2.0
      )

      scrollYRef.current += currentSpeedRef.current * delta
      materialRef.current.uniforms.uScrollY.value = scrollYRef.current
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
          uniform float uScrollY;
          varying float vAlpha;
          varying float vY;

          void main() {
            vec3 pos = position;
            // 深度が深くなっても風の横揺れはゼロにはしない (最低0.4倍)
            float depthSpeedMult = 1.0 - (uProgress * 0.6);
            
            // Y軸：アキュムレータで上下の移動を制御
            pos.y += uScrollY * aSpeed * 30.0; // スピードの係数を上げて動きをはっきりさせる
            
            // 🚨 修正：風速の影響を強くして、都市の風をしっかり視覚化する
            float windDrift = uTime * uWind * aSpeed * 0.4;
            pos.x += windDrift + sin(uTime * aSpeed * 12.0 + pos.y * 3.0) * 0.15 * depthSpeedMult;
            
            // Z軸：奥行きの揺らぎ
            pos.y += sin(uTime * aSpeed * 8.0 + pos.x * 2.0) * 0.1 * depthSpeedMult;

            // 画面外に出た雪をループさせる
            pos.y = mod(pos.y + 10.0, 20.0) - 10.0;
            pos.x = mod(pos.x + 10.0, 20.0) - 10.0;
            
            vY = pos.y;
            
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            
            gl_PointSize = max((150.0 * aScale * uDpr) / -mvPosition.z, 3.0);
            
            vAlpha = 0.5 + 0.5 * sin(uTime * aSpeed * 15.0 * depthSpeedMult + pos.x * 10.0);
          }
        `}
        fragmentShader={`
          varying float vAlpha;
          varying float vY;
          uniform float uProgress;
          
          void main() {
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;
            float alpha = smoothstep(0.5, 0.2, dist) * vAlpha;
            
            float depthDim = 1.0 - (uProgress * 0.7);
            
            float yFadeIn = smoothstep(-10.0, -6.0, vY);
            float yFadeOut = 1.0 - smoothstep(6.0, 10.0, vY);
            float yFade = yFadeIn * yFadeOut;

            gl_FragColor = vec4(0.8, 0.95, 1.0, alpha * depthDim * yFade);
          }
        `}
      />
    </points>
  )
}

// 🚨 修正：sessionPhase を Props に追加
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
  isSuspended?: boolean
  diveTimeMs?: number
  releaseCount?: number
  sessionPhase?: 'diving' | 'interval' | 'completed' // 🚨 追加
}

export function DeepSeaCanvas(props: DeepSeaCanvasProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      <Canvas camera={{ position: [0, 0, 4], fov: 45 }}>
        <color attach="background" args={['#030816']} />
        <fog attach="fog" args={['#030816', 3, 15]} />
        
        <MarineSnow 
          windSpeed={props.windSpeed} 
          count={1200} 
          progress={props.progress} 
          isSuspended={props.isSuspended} 
          descent={props.descent}
          sessionPhase={props.sessionPhase} // 🚨 追加
        />
        <CrystalCoral {...props} />
      </Canvas>
    </div>
  )
}