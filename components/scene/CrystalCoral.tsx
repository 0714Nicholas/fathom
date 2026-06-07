'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, MeshDistortMaterial, Float } from '@react-three/drei'
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
  const groupRef = useRef<THREE.Group>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)

  useFrame((state, delta) => {
    // 1. 共鳴の検知
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }

    // 閃光のエネルギーを減衰
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 3.0)

    const time = state.clock.elapsedTime

    // 2. 内なる蒼炎（コア）
    if (innerMatRef.current) {
      const baseGlow = 0.5 + Math.sin(time * 1.2) * 0.2
      // 共鳴時は圧倒的な発光
      innerMatRef.current.emissiveIntensity = baseGlow + flashEnergy.current * 5.0
    }

    // 3. 黒曜の液体（外殻）
    if (outerMatRef.current) {
      // 普段は深い黒曜石の色、共鳴時は蒼白く光る
      const baseColor = new THREE.Color('#050a15')
      const flashColor = new THREE.Color('#8fd8ff')
      outerMatRef.current.color.lerpColors(baseColor, flashColor, flashEnergy.current * 0.8)

      // 🚨ここがポイント：常に半透明（0.5）を保ち、UIを隠さない。共鳴時のみ少し不透明度を上げる
      outerMatRef.current.opacity = 0.5 + flashEnergy.current * 0.3

      // 風と共鳴による波打ち（1/fゆらぎ）
      const baseDistort = 0.3 + (windSpeed * 0.02)
      outerMatRef.current.distort = THREE.MathUtils.lerp(
        outerMatRef.current.distort,
        baseDistort + flashEnergy.current * 0.5, // 共鳴時に大きく歪む
        delta * 2
      )
    }

    // 4. 共鳴時に全体が少し膨張するギミック
    if (groupRef.current) {
      const targetScale = 0.75 + flashEnergy.current * 0.15
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 5)
    }
  })

  return (
    // 🔽 UIの邪魔にならないよう少し下（y: -0.5）に配置し、サイズを最適化
    <group ref={groupRef} scale={0.75} position={[0, -0.5, 0]}>
      
      {/* [ 内なるコア：蒼い静炎 ] */}
      <Float speed={3} rotationIntensity={2} floatIntensity={1}>
        <Sphere args={[0.35, 32, 32]}>
          <meshStandardMaterial
            ref={innerMatRef}
            color="#ffffff"
            emissive="#4ab9ff" // 深く美しい蒼
            emissiveIntensity={1.0}
            toneMapped={false}
          />
        </Sphere>
      </Float>

      {/* [ 外殻：黒曜の液体 ] */}
      <Sphere args={[1.2, 64, 64]}>
        <MeshDistortMaterial
          ref={outerMatRef}
          color="#050a15"
          transparent={true} // 🚨CSS背景と馴染ませるための必須設定
          opacity={0.5}      // 背景のテキストが透けて見える
          roughness={0.1}    // 艶やかな表面
          metalness={0.9}    // 金属のような重厚な反射
          distort={0.3}      // 波打ち具合
          speed={2}          // 波打ちの速度
        />
      </Sphere>

    </group>
  )
}