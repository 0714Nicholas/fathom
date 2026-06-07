'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, MeshTransmissionMaterial, Float, Environment, MeshDistortMaterial } from '@react-three/drei'
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
  descent = 1
}: CrystalCoralProps) {
  const outerMatRef = useRef<any>(null)
  const innerMatRef = useRef<any>(null) // 🚨 変更：内側のコアもうねらせるためにRefを変更
  const groupRef = useRef<THREE.Group>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)

  useFrame((state, delta) => {
    // 共鳴の検知
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 2.0)

    const time = state.clock.elapsedTime

    // 1. 内なるコア：圧縮された蒼炎の脈動（プラズマのように常にうねる）
    if (innerMatRef.current) {
      // 常に強めに燃え続ける（暗い外殻を透過させるため）
      const baseGlow = 2.5 + Math.sin(time * 2.0) * 0.5
      const flashGlow = flashEnergy.current * 8.0
      innerMatRef.current.emissiveIntensity = baseGlow + flashGlow
      
      // 共鳴時は、炎の暴れ具合（distort）と速度が劇的に跳ね上がる
      innerMatRef.current.distort = 0.3 + flashEnergy.current * 0.4
      innerMatRef.current.speed = 4.0 + flashEnergy.current * 6.0
    }

    // 2. 外殻：黒曜の液体レンズ（光の減衰を使った本物の透明感）
    if (outerMatRef.current) {
      // 🚨 ポイント：色(color)を変えるのではなく、光の減衰色(attenuationColor)を操作する
      // 普段は深淵の暗さ、共鳴時は完全に透明な水（#ffffff）になる
      const baseAtten = new THREE.Color('#010613') // 深い黒曜色
      const flashAtten = new THREE.Color('#ffffff') // 完全なクリア
      outerMatRef.current.attenuationColor.lerpColors(baseAtten, flashAtten, flashEnergy.current)

      const baseDistortion = 0.5 + (windSpeed * 0.04)
      outerMatRef.current.distortion = THREE.MathUtils.lerp(
        outerMatRef.current.distortion,
        baseDistortion + flashEnergy.current * 1.5,
        delta * 3
      )
      outerMatRef.current.temporalDistortion = 0.3 + flashEnergy.current * 1.5
    }

    // 3. シルエット自体の「1/f 流体うねり」と共鳴振動
    if (groupRef.current) {
      // ゆっくり回転させる
      groupRef.current.rotation.y += delta * 0.15
      groupRef.current.rotation.z = Math.sin(time * 0.4) * 0.05

      // x, y, zを別々の波で伸縮させ、生きている水滴を作る
      const wobbleX = 1 + Math.sin(time * 0.7) * 0.025 + Math.sin(time * 1.3) * 0.015
      const wobbleY = 1 + Math.cos(time * 0.8) * 0.025 + Math.cos(time * 1.4) * 0.015
      const wobbleZ = 1 + Math.sin(time * 0.9) * 0.025 + Math.cos(time * 1.5) * 0.015

      const baseScale = 0.85
      
      // 共鳴時：一気に膨張し、激しく振動する
      const flashExpand = flashEnergy.current * 0.12
      const flashVibrateX = Math.sin(time * 20) * flashEnergy.current * 0.03
      const flashVibrateY = Math.cos(time * 23) * flashEnergy.current * 0.03

      const targetX = baseScale * wobbleX + flashExpand + flashVibrateX
      const targetY = baseScale * wobbleY + flashExpand + flashVibrateY
      const targetZ = baseScale * wobbleZ + flashExpand

      groupRef.current.scale.lerp(new THREE.Vector3(targetX, targetY, targetZ), delta * 5)
    }
  })

  return (
    <group ref={groupRef} scale={0.85} position={[0, -0.2, 0]}>
      {/* 空間の光と反射環境 */}
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 5, 2]} intensity={1.5} color="#8fd8ff" />
      <Environment preset="night" />

      {/* 内なるコア：圧縮された蒼炎 */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <Sphere args={[0.3, 64, 64]}> {/* 解像度を上げて滑らかな炎に */}
          <MeshDistortMaterial
            ref={innerMatRef}
            color="#ffffff"
            emissive="#0066ff" // 深く強い蒼色
            emissiveIntensity={2.5}
            toneMapped={false}
            distort={0.3} // 初期状態でもプラズマのようにうねる
            speed={4}     // うねりの速度
          />
        </Sphere>
      </Float>

      {/* 外殻：黒曜の液体レンズ */}
      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={2.8}             // 重厚な厚み
          roughness={0.05}            // 表面の鋭い艶
          transmission={1}            // 100%透過
          ior={1.45}                  // 高い屈折率
          chromaticAberration={0.08}  // 色収差
          distortion={0.5}            // 表面の流体歪み
          temporalDistortion={0.3}    // 歪みの速度
          color="#ffffff"             // 🚨 ベースは透明なガラス
          attenuationColor="#010613"  // 🚨 ここで暗い黒曜石の色に減衰させる
          attenuationDistance={0.5}   // 🚨 光が一定距離進むと暗くなる（中心の光は透過する魔法）
          envMapIntensity={2.0}
        />
      </Sphere>
    </group>
  )
}