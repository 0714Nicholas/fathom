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
  temp = 15,
  diveTimeMs = 0,
  releaseCount = 0
}: DeepSeaCanvasProps) {
  const outerMatRef = useRef<any>(null)
  const innerMatRef = useRef<any>(null)
  const groupRef = useRef<THREE.Group>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)

  // 🚨 進化度の計算：潜水時間(分) + 放流回数×5。最大100でMAX進化。
  const evolutionScore = (diveTimeMs / 60000) + (releaseCount * 5)
  const evolutionRatio = useMemo(() => THREE.MathUtils.clamp(evolutionScore / 100, 0, 1), [evolutionScore])

  const colorRatio = useMemo(() => THREE.MathUtils.clamp((temp + 10) / 45, 0, 1), [temp])
  
  const coreColors = useMemo(() => {
    const coldEmissive = new THREE.Color('#0044ff') 
    const hotEmissive = new THREE.Color('#00ff66')  
    return {
      emissive: new THREE.Color().lerpColors(coldEmissive, hotEmissive, colorRatio)
    }
  }, [colorRatio])

  const outerColors = useMemo(() => {
    const coldAtten = new THREE.Color('#88ccff')
    const hotAtten = new THREE.Color('#88ffcc')
    return new THREE.Color().lerpColors(coldAtten, hotAtten, colorRatio)
  }, [colorRatio])

  const lightIntensity = useMemo(() => THREE.MathUtils.lerp(1.2, 0.4, clouds / 100), [clouds])
  const waterMurkiness = useMemo(() => Math.max(0.05, THREE.MathUtils.lerp(0.05, 0.2, Math.min(rainAmount / 5, 1))), [rainAmount])

  // 🚨 成長によるガラスの進化：進化するほどガラスが分厚く、屈折が複雑になる
  const glassThickness = useMemo(() => THREE.MathUtils.lerp(1.5, 3.5, evolutionRatio), [evolutionRatio])
  const glassIor = useMemo(() => THREE.MathUtils.lerp(1.2, 1.28, evolutionRatio), [evolutionRatio])

  useFrame((state, delta) => {
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 0.4)

    const time = state.clock.elapsedTime

    if (innerMatRef.current) {
      const baseGlow = 1.5 + Math.sin(time * 3.0) * 0.5 
      const flashGlow = flashEnergy.current * 5.0 
      innerMatRef.current.emissiveIntensity = baseGlow + flashGlow
      
      // 🚨 成長によるコアの進化：進化するほどうねりが激しく、生命力を持つ
      const pressureDistortion = progress * 0.3
      const evolutionDistortion = evolutionRatio * 0.4 
      innerMatRef.current.distort = 0.5 + pressureDistortion + evolutionDistortion + flashEnergy.current * 0.4
      innerMatRef.current.speed = 8.0 + (evolutionRatio * 6.0) + flashEnergy.current * 6.0
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

      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <Sphere args={[0.4, 64, 64]}> 
          <MeshDistortMaterial
            ref={innerMatRef}
            color="#000000" 
            emissive={coreColors.emissive} 
            emissiveIntensity={1.5} 
            toneMapped={false}
            distort={0.6} 
            speed={8}     
          />
        </Sphere>
      </Float>

      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={glassThickness}   // 🚨 進化によって分厚くなる
          roughness={waterMurkiness}      
          transmission={1.0} 
          ior={glassIor}               // 🚨 進化によって屈折率が上がり、複雑な光を放つ
          chromaticAberration={0.05}  
          distortion={0.5}            
          temporalDistortion={0.3}    
          color="#ffffff" 
          attenuationColor={outerColors} 
          attenuationDistance={3.0} 
          envMapIntensity={0.8}       
        />
      </Sphere>
    </group>
  )
}