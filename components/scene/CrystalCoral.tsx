'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, MeshTransmissionMaterial, Float } from '@react-three/drei'
import * as THREE from 'three'

interface CrystalCoralProps {
  progress?: number
  resonancePulse?: number
  resonanceEnergy?: number
  identity?: any
}

export function CrystalCoral({ 
  progress = 0, 
  resonancePulse = 0,
}: CrystalCoralProps) {
  const outerMatRef = useRef<any>(null)
  const innerMatRef = useRef<THREE.MeshStandardMaterial>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)

  useFrame((state, delta) => {
    // 1. パルス（共鳴）の検知
    // 手紙を書いたり、誰かの気配を受信した瞬間にエネルギーが跳ね上がる
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0 // 閃光のエネルギーをMAXに
      prevPulse.current = resonancePulse
    }

    // エネルギーをゆっくり減衰させる（余韻を残す）
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 2.5)

    const time = state.clock.elapsedTime

    // 2. 内なる蒼炎（コア）の呼吸と脈動
    if (innerMatRef.current) {
      // 普段は1/fゆらぎのように、複数のサイン波を重ねて静かに明滅（0.2〜0.5）
      const baseGlow = 0.3 + Math.sin(time * 0.8) * 0.1 + Math.sin(time * 0.3) * 0.1
      
      // 共鳴時は圧倒的な閃光（最大4.0）を放つ
      const flashGlow = flashEnergy.current * 4.0
      innerMatRef.current.emissiveIntensity = baseGlow + flashGlow
    }

    // 3. 黒曜の液体レンズ（外殻）の透過と屈折
    if (outerMatRef.current) {
      // 普段は重厚な漆黒（#020305）、共鳴時は完全に透明なプリズム（#ffffff）へ劇的に変化
      const baseColor = new THREE.Color('#020305')
      const flashColor = new THREE.Color('#ffffff')
      outerMatRef.current.color.lerpColors(baseColor, flashColor, flashEnergy.current * 0.9)

      // 共鳴時は表面の曇り（roughness）が消え、純度の高いクリスタルになる
      outerMatRef.current.roughness = 0.25 - flashEnergy.current * 0.2
    }
  })

  return (
    <group scale={1.2}>
      {/* 
        [ 内なるコア：蒼い静炎 ]
        常に浮遊（Float）しながら、エネルギーを蓄えている思考の核 
      */}
      <Float speed={2} rotationIntensity={0.8} floatIntensity={0.6}>
        <Sphere args={[0.35, 32, 32]}>
          <meshStandardMaterial
            ref={innerMatRef}
            color="#ffffff"
            emissive="#8fd8ff" // 蒼白い炎
            emissiveIntensity={0.5}
            toneMapped={false} // これをfalseにすることで、光が白飛びして「オーラ」になる
          />
        </Sphere>
      </Float>

      {/* 
        [ 外殻：黒曜の液体レンズ ]
        周囲のノイズを遮断しつつ、背景を美しく歪ませる1/fゆらぎの重力レンズ 
      */}
      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={2.5}            // 水の厚み（値が大きいほど背景がグニャリと屈折する）
          roughness={0.25}           // 表面のわずかな曇り（ノイズを遮断する質感）
          transmission={1}           // 100%のガラス/液体透過
          ior={1.33}                 // 水の屈折率（1.33）
          chromaticAberration={0.08} // 光の分散（レンズの縁に虹色の滲みを生む）
          distortion={0.5}           // 1/fゆらぎ（表面の不規則なうねり）
          temporalDistortion={0.15}  // うねりの時間変化スピード（ゆっくり）
          color="#020305"            // ベースは黒曜石
          backside                   // 裏側の屈折も計算して深みを出す
        />
      </Sphere>
    </group>
  )
}