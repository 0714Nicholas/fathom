'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, MeshTransmissionMaterial, Float } from '@react-three/drei'
import * as THREE from 'three'

// 🔽 修正：DeepSeaCanvas から渡されるプロパティ（windSpeed, descent）をすべて受け取れるように型を定義
interface CrystalCoralProps {
  progress?: number
  windSpeed?: number
  resonancePulse?: number
  resonanceEnergy?: number
  identity?: any
  descent?: number
}

export function CrystalCoral({ 
  progress = 0, 
  windSpeed = 0,
  resonancePulse = 0,
  resonanceEnergy = 0,
  identity,
  descent = 1
}: CrystalCoralProps) {
  const outerMatRef = useRef<any>(null)
  const innerMatRef = useRef<THREE.MeshStandardMaterial>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)

  useFrame((state, delta) => {
    // 1. パルス（共鳴）の検知
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0 // 閃光のエネルギーをMAXに
      prevPulse.current = resonancePulse
    }

    // エネルギーをゆっくり減衰させる（余韻）
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 2.5)

    const time = state.clock.elapsedTime

    // 2. 内なる蒼炎（コア）の呼吸と脈動
    if (innerMatRef.current) {
      // 普段は1/fゆらぎのように静かに明滅
      const baseGlow = 0.3 + Math.sin(time * 0.8) * 0.1 + Math.sin(time * 0.3) * 0.1
      // 共鳴時は圧倒的な閃光を放つ
      const flashGlow = flashEnergy.current * 4.0
      innerMatRef.current.emissiveIntensity = baseGlow + flashGlow
    }

    // 3. 黒曜の液体レンズ（外殻）の透過と屈折
    if (outerMatRef.current) {
      // 共鳴時は漆黒から透明なプリズムへ変化
      const baseColor = new THREE.Color('#020305')
      const flashColor = new THREE.Color('#ffffff')
      outerMatRef.current.color.lerpColors(baseColor, flashColor, flashEnergy.current * 0.9)

      // 共鳴時は表面の曇りが消え、純度の高いクリスタルになる
      outerMatRef.current.roughness = 0.25 - flashEnergy.current * 0.2

      // 🔽 追加ギミック：都市の風速（windSpeed）によってレンズの表面のうねり（歪み）が変化する
      const baseDistortion = 0.4
      const windEffect = Math.min(windSpeed * 0.05, 0.4) // 風が強すぎても崩れないようにリミットをかける
      const targetDistortion = baseDistortion + windEffect
      outerMatRef.current.distortion = THREE.MathUtils.lerp(outerMatRef.current.distortion, targetDistortion, delta)
    }
  })

  return (
    <group scale={1.2}>
      {/* [ 内なるコア：蒼い静炎 ] */}
      <Float speed={2} rotationIntensity={0.8} floatIntensity={0.6}>
        <Sphere args={[0.35, 32, 32]}>
          <meshStandardMaterial
            ref={innerMatRef}
            color="#ffffff"
            emissive="#8fd8ff" // 蒼白い炎
            emissiveIntensity={0.5}
            toneMapped={false}
          />
        </Sphere>
      </Float>

      {/* [ 外殻：黒曜の液体レンズ ] */}
      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={2.5}            
          roughness={0.25}           
          transmission={1}           
          ior={1.33}                 
          chromaticAberration={0.08} 
          distortion={0.5}           
          temporalDistortion={0.15}  
          color="#020305"            
          backside                   
        />
      </Sphere>
    </group>
  )
}