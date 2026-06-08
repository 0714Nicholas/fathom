'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { CrystalCoral } from './CrystalCoral'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

// 🚨 修正：四角い箱ではなく、美しく発光する円形の「マリンスノー」を生成する専用シェーダー
function MarineSnow({ count = 1200, windSpeed = 0 }) {
  const pointsRef = useRef<THREE.Points>(null)
  
  const [positions, scales, speeds] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const sca = new Float32Array(count)
    const spd = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      // 空間全体に配置
      pos[i * 3] = (Math.random() - 0.5) * 20
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20
      pos[i * 3 + 2] = (Math.random() - 0.5) * 15 - 2
      sca[i] = Math.random() * 0.5 + 0.1
      spd[i] = Math.random() * 0.02 + 0.01
    }
    return [pos, sca, spd]
  }, [count])

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uWind: { value: windSpeed }
  }), [windSpeed])

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uWind.value = windSpeed
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aScale" count={count} array={scales} itemSize={1} />
        <bufferAttribute attach="attributes-aSpeed" count={count} array={speeds} itemSize={1} />
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
          varying float vAlpha;
          void main() {
            vec3 pos = position;
            // ゆっくりとした上昇と、風速による僅かな横流れ
            pos.y += uTime * aSpeed * 1.5;
            pos.x += uTime * uWind * aSpeed * 0.05;
            
            // 画面外に出たらループ
            pos.y = mod(pos.y + 10.0, 20.0) - 10.0;
            pos.x = mod(pos.x + 10.0, 20.0) - 10.0;
            
            // 1/fのように有機的に揺らぐ
            pos.x += sin(uTime * aSpeed * 10.0 + pos.y) * 0.1;

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            
            // 遠近法によるサイズの変化
            gl_PointSize = (20.0 * aScale) / -mvPosition.z;
            
            // 明滅（Twinkle）エフェクト
            vAlpha = 0.2 + 0.8 * sin(uTime * aSpeed * 15.0 + pos.x * 10.0);
          }
        `}
        fragmentShader={`
          varying float vAlpha;
          void main() {
            // 🚨 ここが四角い箱を「美しい円形」に削り出す魔法の数式
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;
            
            // 中心ほど明るく、フチに向かって柔らかく消える
            float alpha = smoothstep(0.5, 0.1, dist) * vAlpha * 0.5;
            
            // 淡いシアンブルー
            gl_FragColor = vec4(0.6, 0.85, 1.0, alpha);
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
        <fog attach="fog" args={['#02050a', 2, 10]} />
        {/* 四角いSparklesなどを削除し、MarineSnowに置き換え */}
        <MarineSnow windSpeed={props.windSpeed} count={1200} />
        <CrystalCoral {...props} />
      </Canvas>
    </div>
  )
}