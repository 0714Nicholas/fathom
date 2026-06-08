'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CrystalCoral } from './CrystalCoral'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

// 🚨 修正：isSuspended（一時停止中かどうか）を受け取る
function MarineSnow({ count = 1200, windSpeed = 0, progress = 0, isSuspended = false }) {
  const pointsRef = useRef<THREE.Points>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  
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
    uSuspended: { value: 0 } // 🚨 新規：進行方向をブレンドするための変数
  }), [dpr])

  useFrame((state, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
      materialRef.current.uniforms.uWind.value = windSpeed
      materialRef.current.uniforms.uProgress.value = progress

      // 🚨 スムーズに進行方向と速度を切り替える（急にガクッと向きを変えないため）
      const targetSuspended = isSuspended ? 1.0 : 0.0
      materialRef.current.uniforms.uSuspended.value = THREE.MathUtils.lerp(
        materialRef.current.uniforms.uSuspended.value,
        targetSuspended,
        delta * 2.0
      )
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
          uniform float uSuspended;
          varying float vAlpha;
          varying float vY; // 🚨 新規：Y座標をフラグメントシェーダーに渡す

          void main() {
            vec3 pos = position;
            
            float depthSpeedMult = 1.0 - (uProgress * 0.8);
            
            // 🚨 潜水時は上(0.8)へ、Suspend(停止)時は本来の雪のようにゆっくり下(-0.3)へ
            float currentSpeed = mix(0.8, -0.3, uSuspended);
            
            pos.y += uTime * aSpeed * currentSpeed * depthSpeedMult;
            pos.x += sin(uTime * aSpeed * 12.0 + pos.y * 3.0) * 0.15 * depthSpeedMult;
            pos.y += sin(uTime * aSpeed * 8.0 + pos.x * 2.0) * 0.1 * depthSpeedMult;

            pos.y = mod(pos.y + 10.0, 20.0) - 10.0;
            pos.x = mod(pos.x + 10.0, 20.0) - 10.0;
            
            vY = pos.y; // 🚨 Y座標を保存
            
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            
            gl_PointSize = max((150.0 * aScale * uDpr) / -mvPosition.z, 3.0);
            
            vAlpha = 0.5 + 0.5 * sin(uTime * aSpeed * 15.0 * depthSpeedMult + pos.x * 10.0);
          }
        `}
        fragmentShader={`
          varying float vAlpha;
          varying float vY; // 🚨 新規
          uniform float uProgress;
          
          void main() {
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;
            float alpha = smoothstep(0.5, 0.2, dist) * vAlpha;
            
            float depthDim = 1.0 - (uProgress * 0.7);
            
            // 🚨 新規：上下に消えていくグラデーション（Yが±10に近づくと透明になる）
            // これにより、上に飛び去る時にプツッと消えず、暗闇にフワッと溶けます
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
  isSuspended?: boolean // 🚨 追加
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
        />
        <CrystalCoral {...props} />
      </Canvas>
    </div>
  )
}