'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, MeshTransmissionMaterial, Float, Environment, MeshDistortMaterial } from '@react-three/drei'
import * as THREE from 'three'
import type { DeepSeaCanvasProps } from './DeepSeaCanvas'

export function CrystalCoral({ 
  progress = 0, 
  windSpeed = 0,
  clouds = 0,
  rainAmount = 0,
  resonancePulse = 0,
  temp = 15
}: DeepSeaCanvasProps) {
  const outerMatRef = useRef<any>(null)
  const innerMatRef = useRef<any>(null)
  const groupRef = useRef<THREE.Group>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)

  // 気温（temp）による色変化 (-10℃ 〜 35℃)
  const colorRatio = useMemo(() => THREE.MathUtils.clamp((temp + 10) / 45, 0, 1), [temp])
  
  const coreColors = useMemo(() => {
    // 🚨 修正：コア自体は深い色を発光させる
    const coldEmissive = new THREE.Color('#0044ff') // 深い海のような青
    const hotEmissive = new THREE.Color('#00ff66')  // 生命力のあるエメラルド
    return {
      emissive: new THREE.Color().lerpColors(coldEmissive, hotEmissive, colorRatio)
    }
  }, [colorRatio])

  const outerColors = useMemo(() => {
    // 🚨 修正：ガラスを通した時に濁らないよう、明るく澄んだ色を減衰色に指定
    const coldAtten = new THREE.Color('#88ccff')
    const hotAtten = new THREE.Color('#88ffcc')
    return new THREE.Color().lerpColors(coldAtten, hotAtten, colorRatio)
  }, [colorRatio])

  const lightIntensity = useMemo(() => THREE.MathUtils.lerp(1.2, 0.4, clouds / 100), [clouds])
  // 雨による濁りは最低限の 0.05（うっすらした曇りガラス）〜0.2に留める
  const waterMurkiness = useMemo(() => Math.max(0.05, THREE.MathUtils.lerp(0.05, 0.2, Math.min(rainAmount / 5, 1))), [rainAmount])

  useFrame((state, delta) => {
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 0.4)

    const time = state.clock.elapsedTime

    if (innerMatRef.current) {
      // 🚨 修正：ベースの発光を 1.5 程度に抑え、うねりの陰影（暗い部分）を残す
      const baseGlow = 1.5 + Math.sin(time * 3.0) * 0.5 
      const flashGlow = flashEnergy.current * 5.0 
      innerMatRef.current.emissiveIntensity = baseGlow + flashGlow
      
      const pressureDistortion = progress * 0.3
      innerMatRef.current.distort = 0.5 + pressureDistortion + flashEnergy.current * 0.4
      innerMatRef.current.speed = 8.0 + flashEnergy.current * 6.0
    }

    if (outerMatRef.current) {
      const flashAtten = new THREE.Color('#ffffff') 
      outerMatRef.current.attenuationColor.lerpColors(outerColors, flashAtten, flashEnergy.current)

      const baseDistortion = 0.4 + (windSpeed * 0.06)
      outerMatRef.current.distortion = THREE.MathUtils.lerp(
        outerMatRef.current.distortion,
        baseDistortion + flashEnergy.current * 1.5,
        delta * 3
      )
      outerMatRef.current.temporalDistortion = 0.2 + (windSpeed * 0.05) + flashEnergy.current * 1.5
    }

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15
      groupRef.current.rotation.z = Math.sin(time * 0.4) * 0.05

      const wobbleX = 1 + Math.sin(time * 0.7) * 0.025 + Math.sin(time * 1.3) * 0.015
      const wobbleY = 1 + Math.cos(time * 0.8) * 0.025 + Math.cos(time * 1.4) * 0.015
      const wobbleZ = 1 + Math.sin(time * 0.9) * 0.025 + Math.cos(time * 1.5) * 0.015

      const baseScale = 0.55 - (progress * 0.03)
      
      const flashExpand = flashEnergy.current * 0.15
      const flashVibrateX = Math.sin(time * 20) * flashEnergy.current * 0.03
      const flashVibrateY = Math.cos(time * 23) * flashEnergy.current * 0.03

      const targetX = baseScale * wobbleX + flashExpand + flashVibrateX
      const targetY = baseScale * wobbleY + flashExpand + flashVibrateY
      const targetZ = baseScale * wobbleZ + flashExpand

      groupRef.current.scale.lerp(new THREE.Vector3(targetX, targetY, targetZ), delta * 5)
    }
  })

  return (
    <group ref={groupRef} scale={0.55} position={[0, -0.2, 0]}>
      <ambientLight intensity={lightIntensity * 0.5} />
      <directionalLight position={[5, 5, 2]} intensity={lightIntensity} color="#8fd8ff" />
      <Environment preset="night" />

      {/* 🚨 内側のコア：色を黒ベースにして発光(emissive)だけで見せることで、うねりの立体感を強調 */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <Sphere args={[0.4, 64, 64]}> 
          <MeshDistortMaterial
            ref={innerMatRef}
            color="#000000" // ここを黒にすることで、白飛びを防ぎ立体感が出る
            emissive={coreColors.emissive} 
            emissiveIntensity={1.5} 
            toneMapped={false} // 絶対にfalse（色が平坦になるのを防ぐ）
            distort={0.6} 
            speed={8}     
          />
        </Sphere>
      </Float>

      {/* 🚨 外側のガラス外殻：完全なガラスの物理法則に戻す */}
      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={1.5}             
          roughness={waterMurkiness}      
          transmission={1.0} // 🚨 絶対に1.0（これでプラスチック感が消え、ガラスに戻る）
          ior={1.2} // 🚨 1.05だと平坦すぎ、1.33だと黒背景を吸いすぎる。1.2が黄金比。
          chromaticAberration={0.05}  
          distortion={0.5}            
          temporalDistortion={0.3}    
          color="#ffffff" // 🚨 ガラス表面自体は必ず無色透明(白)にする
          attenuationColor={outerColors} // 🚨 光が通過した時にこの色（気温の色）がつく
          attenuationDistance={3.0} // 距離を適度に取ることで、透き通った色になる
          envMapIntensity={0.8}       
        />
      </Sphere>
    </group>
  )
}