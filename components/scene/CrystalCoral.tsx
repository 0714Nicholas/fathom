'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, MeshTransmissionMaterial, Float } from '@react-three/drei'
import * as THREE from 'three'

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

    // エネルギーをゆっくり減衰させる
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 2.5)

    const time = state.clock.elapsedTime

    // 2. 内なる蒼炎（コア）の呼吸と脈動
    if (innerMatRef.current) {
      // 普段から蒼いオーラを少し強めに明滅させる
      const baseGlow = 0.8 + Math.sin(time * 0.8) * 0.3 + Math.sin(time * 0.3) * 0.2
      // 共鳴時は圧倒的な閃光を放つ
      const flashGlow = flashEnergy.current * 6.0
      innerMatRef.current.emissiveIntensity = baseGlow + flashGlow
    }

    // 3. 黒曜の液体レンズ（外殻）の透過と屈折
    if (outerMatRef.current) {
      // 共鳴時は表面の曇り（roughness）が完全に消え、純度の高いクリスタルになる
      outerMatRef.current.roughness = 0.15 - flashEnergy.current * 0.15

      // 風速と共鳴エネルギーによる表面のうねり（1/fゆらぎ）
      const baseDistortion = 0.3
      const windEffect = Math.min(windSpeed * 0.05, 0.4)
      const flashDistortion = flashEnergy.current * 0.6 // 共鳴時は大きく波打つ
      outerMatRef.current.distortion = THREE.MathUtils.lerp(
        outerMatRef.current.distortion, 
        baseDistortion + windEffect + flashDistortion, 
        delta * 2
      )
    }
  })

  return (
    // 🔽 サイズを 1.2 -> 0.85 に縮小し、UIの邪魔にならない「高密度のコア」にする
    <group scale={0.85}>
      {/* [ 内なるコア：蒼い静炎 ] */}
      <Float speed={2.5} rotationIntensity={1.5} floatIntensity={0.8}>
        <Sphere args={[0.35, 32, 32]}>
          <meshStandardMaterial
            ref={innerMatRef}
            color="#ffffff"
            emissive="#8fd8ff" // 蒼白い炎
            emissiveIntensity={1.0}
            toneMapped={false}
          />
        </Sphere>
      </Float>

      {/* [ 外殻：黒曜の液体レンズ ] */}
      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={2.0}            // 水の厚み
          roughness={0.15}           // わずかな曇り
          transmission={1}           // 🚨光を完全に通す（これが1じゃないと黒い穴になる）
          ior={1.4}                  // 水(1.33)とガラス(1.5)の中間の屈折率。重みのある液体
          chromaticAberration={0.15} // 光の虹色の分散を少し強めて神秘的に
          distortion={0.3}           // 基本のゆらぎ
          temporalDistortion={0.2}   // ゆらぎのスピード
          color="#ffffff"            // 🚨ベースは「白（透明）」にする
          attenuationColor="#0a192f" // 🚨ここで「黒曜石の暗い青黒さ」を着色する
          attenuationDistance={1.2}  // 光が減衰して暗くなる距離
          backside                   
        />
      </Sphere>
    </group>
  )
}