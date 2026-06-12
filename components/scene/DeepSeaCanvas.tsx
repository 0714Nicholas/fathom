'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CrystalCoral } from './CrystalCoral'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

function MarineSnow({ count = 1200, windSpeed = 0, progress = 0, isSuspended = false, descent = 1 }) {
  const pointsRef = useRef<THREE.Points>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  
  // 速度が変化しても宇宙全体がワープしないように、Y座標の移動距離をCPU側で累積（アキュムレート）する
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

      // プレイヤーの「状態」に合わせて相対的な雪の速度を決定
      let targetSpeed = -0.15; // 状態2：漂流中（基本は下にゆっくり降る）
      
      if (isSuspended) {
        targetSpeed = -0.3; // 状態3：完全停止（さらに少し早く雪が降る）
      }
      if (descent < 1.0) {
        targetSpeed = 1.5; // 状態1：ダイブ中（雪は上へ飛び去る）
      }

      currentSpeedRef.current = THREE.MathUtils.lerp(
        currentSpeedRef.current,
        targetSpeed,
        delta * 1.5
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
            float depthSpeedMult = 1.0 - (uProgress * 0.8);
            
            // Y軸：アキュムレータでワープを防ぐ
            pos.y += uScrollY * aSpeed * depthSpeedMult;
            
            // 風速×時間で、常に横へ流されるようにする
            float windDrift = uTime * uWind * aSpeed * 0.05;
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
            
            // 上下にフワッと消えるグラデーション
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

// 🚨 追加されたProps（diveTimeMs, releaseCount）
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
        />
        {/* CrystalCoralにPropsをすべて渡す */}
        <CrystalCoral {...props} />
      </Canvas>
    </div>
  )
}