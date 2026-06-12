'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, Icosahedron, MeshTransmissionMaterial, Float, Environment, MeshDistortMaterial } from '@react-three/drei'
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
  
  // 🚨 修正：内側のコアを「液体（Plasma）」と「固体（Solid / 神聖幾何学）」の2つに分ける
  const innerPlasmaRef = useRef<any>(null)
  const innerSolidRef = useRef<any>(null)
  const innerSolidMeshRef = useRef<THREE.Mesh>(null)
  
  const groupRef = useRef<THREE.Group>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)

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

  const glassThickness = useMemo(() => THREE.MathUtils.lerp(1.5, 3.5, evolutionRatio), [evolutionRatio])
  const glassIor = useMemo(() => THREE.MathUtils.lerp(1.2, 1.28, evolutionRatio), [evolutionRatio])

  useFrame((state, delta) => {
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 0.4)

    const time = state.clock.elapsedTime

    // 🚨 修正：水深50%から100%にかけての「硬化・結晶化」の進行度（0.0 〜 1.0）
    const depthHardening = THREE.MathUtils.clamp((progress - 0.5) / 0.5, 0, 1);

    const baseGlow = 1.5 + Math.sin(time * 3.0) * 0.5 
    const flashGlow = flashEnergy.current * 5.0 

    // 1. 液状コア（Plasma）の制御：硬化が進むにつれて光が消えていく
    if (innerPlasmaRef.current) {
      innerPlasmaRef.current.emissiveIntensity = (baseGlow + flashGlow) * (1.0 - depthHardening);
      const pressureDistortion = progress * 0.3
      const evolutionDistortion = evolutionRatio * 0.4 
      innerPlasmaRef.current.distort = 0.5 + pressureDistortion + evolutionDistortion + flashEnergy.current * 0.4
      innerPlasmaRef.current.speed = 8.0 + (evolutionRatio * 6.0) + flashEnergy.current * 6.0
    }

    // 2. 固体コア（Solid / 神聖幾何学）の制御：硬化が進むにつれて浮かび上がり、回転する
    if (innerSolidRef.current && innerSolidMeshRef.current) {
      innerSolidRef.current.emissiveIntensity = (baseGlow + flashGlow) * depthHardening * 2.0;
      innerSolidMeshRef.current.rotation.x += delta * (0.2 + depthHardening * 0.5);
      innerSolidMeshRef.current.rotation.y += delta * (0.3 + depthHardening * 0.8);
    }

    // 3. 外側のガラス（Shell）の制御：硬化が進むと動きが凍りつき、屈折率と厚みが異常に高まる
    if (outerMatRef.current) {
      const flashAtten = new THREE.Color('#ffffff') 
      outerMatRef.current.attenuationColor.lerpColors(outerColors, flashAtten, flashEnergy.current)

      const baseDistortion = 0.4 + (windSpeed * 0.06)
      // うねり（temporalDistortion）を depthHardening で 0 に近づけ、完全に「凍結」させる
      const currentTemporalDistortion = 0.2 + (windSpeed * 0.05) + flashEnergy.current * 1.5;
      outerMatRef.current.temporalDistortion = THREE.MathUtils.lerp(currentTemporalDistortion, 0.0, depthHardening);
      
      // 形の歪み（distortion）を大きくして、切り出された鉱石のような見た目に固定する
      const currentDistortion = baseDistortion + flashEnergy.current * 1.5;
      outerMatRef.current.distortion = THREE.MathUtils.lerp(currentDistortion, 0.8, depthHardening);

      // 屈折率（ior）と厚み（thickness）をさらに引き上げ、重厚なクリスタル化を表現
      outerMatRef.current.ior = THREE.MathUtils.lerp(glassIor, 1.45, depthHardening);
      outerMatRef.current.thickness = THREE.MathUtils.lerp(glassThickness, 5.0, depthHardening);
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
        {/* 🚨 1. 潜行前半：液状のプラズマコア */}
        <Sphere args={[0.4, 64, 64]}> 
          <MeshDistortMaterial
            ref={innerPlasmaRef}
            color="#000000" 
            emissive={coreColors.emissive} 
            emissiveIntensity={1.5} 
            toneMapped={false}
            distort={0.6} 
            speed={8}     
          />
        </Sphere>

        {/* 🚨 2. 潜行後半：硬化して浮かび上がる神聖幾何学（正二十面体）コア */}
        <Icosahedron ref={innerSolidMeshRef} args={[0.35, 0]}>
          <meshStandardMaterial
            ref={innerSolidRef}
            color="#000000"
            emissive={coreColors.emissive}
            emissiveIntensity={0} // 初期値は0（見えない）
            toneMapped={false}
            roughness={0.2}
            metalness={0.8}
            wireframe={false} // trueにすると線画の幾何学模様になります（お好みで）
          />
        </Icosahedron>
      </Float>

      {/* 🚨 3. 外側のガラス（バグらない純粋なSphere） */}
      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={glassThickness}   
          roughness={waterMurkiness}      
          transmission={1.0} 
          ior={glassIor}               
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