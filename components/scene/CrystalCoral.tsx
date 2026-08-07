'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, MeshTransmissionMaterial, Float, Environment } from '@react-three/drei'
import * as THREE from 'three'
import type { DeepSeaCanvasProps } from './DeepSeaCanvas'

export type CrystalCoralProps = DeepSeaCanvasProps

const karmaVertexShader = `
  uniform float uTime;
  uniform float uAge;       
  uniform float uResonance; 
  uniform float uCharge;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec3 p = position;
    float l1_norm = abs(p.x) + abs(p.y) + abs(p.z);
    vec3 octahedron = (p / l1_norm) * 1.2; 
    
    vec3 morphedPos = mix(p, octahedron, smoothstep(0.0, 1.0, uAge));
    
    float pulse = sin(uTime * 3.0) * 0.03 * uResonance;
    float chargePulse = sin(uTime * 20.0) * 0.02 * uCharge;
    morphedPos += normal * (pulse + chargePulse);

    vec4 worldPosition = modelMatrix * vec4(morphedPos, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    
    vWorldPosition = worldPosition.xyz;
    vViewPosition = -mvPosition.xyz;
    vNormal = normalize(normalMatrix * mix(normal, normalize(octahedron), smoothstep(0.0, 1.0, uAge)));
    
    gl_Position = projectionMatrix * mvPosition;
  }
`

const karmaFragmentShader = `
  uniform float uTime;
  uniform float uRelease;    
  uniform float uResonance;  
  uniform float uCharge;     
  uniform vec3 uBaseColor;   

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  float hash(float n) { return fract(sin(n) * 1e4); }
  float noise(vec3 x) {
    const vec3 step = vec3(110, 241, 171);
    vec3 i = floor(x); vec3 f = fract(x);
    float n = dot(i, step);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(n + dot(step, vec3(0, 0, 0))), hash(n + dot(step, vec3(1, 0, 0))), u.x),
                   mix(hash(n + dot(step, vec3(0, 1, 0))), hash(n + dot(step, vec3(1, 1, 0))), u.x), u.y),
               mix(mix(hash(n + dot(step, vec3(0, 0, 1))), hash(n + dot(step, vec3(1, 0, 1))), u.x),
                   mix(hash(n + dot(step, vec3(0, 1, 1))), hash(n + dot(step, vec3(1, 1, 1))), u.x), u.y), u.z);
  }

  vec3 palette(in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    vec3 p = vWorldPosition * 3.0 + uTime * 0.05;
    float fbmNoise = noise(p) * 0.5 + noise(p * 2.0) * 0.25;
    
    float fresnel = max(0.0, dot(normal, viewDir));
    float interference = fresnel + (fbmNoise * 0.5);
    
    vec3 a = vec3(0.5); vec3 b = vec3(0.5); vec3 c = vec3(1.0);
    vec3 d = vec3(0.0, 0.33, 0.67) + (uTime * 0.05);
    
    vec3 iridescenceColor = palette(interference, a, b, c, d);
    
    vec3 finalColor = mix(uBaseColor, iridescenceColor, smoothstep(0.0, 1.0, uRelease));
    
    vec3 pulseGlow = vec3(0.4, 0.8, 1.0) * uResonance * 1.0;
    vec3 chargeGlow = vec3(0.8, 0.95, 1.0) * uCharge * 2.5; 

    finalColor += pulseGlow + chargeGlow;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`

export function CrystalCoral({ 
  progress = 0, windSpeed = 0, clouds = 0, rainAmount = 0, resonancePulse = 0, temp = 15,
  diveTimeMs = 0, releaseCount = 0, isCharging = false, turbidity = 0,
  onChargeStart, onChargeStop, 
  tuningValue = 50, isTuning = false
}: CrystalCoralProps) {
  
  const outerMatRef = useRef<any>(null)
  const groupRef = useRef<THREE.Group>(null)
  const karmaMatRef = useRef<THREE.ShaderMaterial>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)

  // コアの色。チャージ前は深海のブルーに沈ませる
  const baseEmissive = useMemo(() => new THREE.Color('#0055aa'), [])

  const lightIntensity = useMemo(() => THREE.MathUtils.lerp(1.2, 0.5, clouds / 100), [clouds])
  const waterMurkiness = useMemo(() => Math.max(0.02, THREE.MathUtils.lerp(0.02, 0.15, Math.min(rainAmount / 5, 1))), [rainAmount])

  const karmaUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAge: { value: 0 },
    uRelease: { value: 0 },
    uResonance: { value: 0 },
    uCharge: { value: 0 },
    uBaseColor: { value: baseEmissive.clone() }
  }), [baseEmissive])

  useFrame((state, delta) => {
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 3.0)
    
    const time = state.clock.elapsedTime
    const depthHardening = THREE.MathUtils.clamp((progress - 0.5) / 0.5, 0, 1)

    if (karmaMatRef.current) {
      const uniforms = karmaMatRef.current.uniforms
      uniforms.uTime.value = time
      uniforms.uAge.value = THREE.MathUtils.lerp(uniforms.uAge.value, Math.min(1.0, diveTimeMs / 36000000), 0.02)
      uniforms.uRelease.value = THREE.MathUtils.lerp(uniforms.uRelease.value, Math.min(1.0, releaseCount / 100), 0.02)
      uniforms.uResonance.value = flashEnergy.current
      uniforms.uCharge.value = THREE.MathUtils.lerp(uniforms.uCharge.value, isCharging ? 1.0 : 0.0, delta * 2.0)

      if (isCharging) {
        uniforms.uBaseColor.value.lerp(new THREE.Color('#ffffff'), 0.1) // 限界チャージで純白に発光
      } else if (isTuning) {
        const targetHue = 0.5 + (tuningValue / 100) * 0.4
        const tuneColor = new THREE.Color().setHSL(targetHue, 1.0, 0.4)
        uniforms.uBaseColor.value.lerp(tuneColor, 0.15)
      } else {
        uniforms.uBaseColor.value.lerp(baseEmissive, 0.05)
      }
    }

    if (outerMatRef.current) {
      const baseMurkiness = waterMurkiness + (turbidity * 0.5) 
      outerMatRef.current.roughness = THREE.MathUtils.lerp(outerMatRef.current.roughness, baseMurkiness, 0.1)
      outerMatRef.current.temporalDistortion = THREE.MathUtils.lerp(0.1 + flashEnergy.current, 0.0, depthHardening)
      outerMatRef.current.distortion = THREE.MathUtils.lerp(0.4 + flashEnergy.current, 0.8, depthHardening)
    }

    if (groupRef.current) {
      const spinSpeed = isTuning ? 1.5 : 0.1
      groupRef.current.rotation.y += delta * spinSpeed
      groupRef.current.rotation.z = Math.sin(time * 0.4) * 0.05

      const wobbleX = 1 + Math.sin(time * 0.7) * 0.015
      const wobbleY = 1 + Math.cos(time * 0.8) * 0.015
      const wobbleZ = 1 + Math.sin(time * 0.9) * 0.015

      const baseScale = 1.0 - (progress * 0.05)
      const chargeScale = isCharging ? -0.05 : 0 
      const flashExpand = flashEnergy.current * 0.08
      const vibrate = isCharging ? Math.sin(time * 50) * 0.005 : 0
      const tuneExpand = isTuning ? Math.sin(time * 15) * 0.02 : 0

      groupRef.current.scale.lerp(
        new THREE.Vector3(
          baseScale * wobbleX + flashExpand + chargeScale + vibrate + tuneExpand, 
          baseScale * wobbleY + flashExpand + chargeScale + vibrate + tuneExpand, 
          baseScale * wobbleZ + flashExpand + chargeScale + vibrate + tuneExpand
        ), 
        delta * 5
      )
    }
  })

  return (
    <group 
      ref={groupRef} 
      scale={1.0} 
      position={[0, 0, 0]}
      onPointerDown={(e) => { e.stopPropagation(); if (onChargeStart) onChargeStart(); }}
      onPointerUp={(e) => { e.stopPropagation(); if (onChargeStop) onChargeStop(); }}
      onPointerOut={(e) => { e.stopPropagation(); if (onChargeStop) onChargeStop(); }}
    >
      {/* 🚨 ハイライトを強く入れ、ガラスの艶を出す */}
      <ambientLight intensity={lightIntensity * 0.5} />
      <directionalLight position={[5, 10, 5]} intensity={lightIntensity * 1.5} color="#ffffff" />
      <pointLight position={[-3, 0, 3]} intensity={1.0} color="#8fd8ff" />
      <Environment preset="night" />

      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
        {/* 🚨 のっぺり感をなくすため、コアを一回り小さくして外側のガラス空間を広く取る */}
        <Sphere args={[0.42, 64, 64]}> 
          <shaderMaterial
            ref={karmaMatRef}
            args={[{
              uniforms: karmaUniforms,
              vertexShader: karmaVertexShader,
              fragmentShader: karmaFragmentShader,
              transparent: true,
              blending: THREE.NormalBlending,
              depthWrite: false
            }]}
          />
        </Sphere>
      </Float>

      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={2.5}          // 🚨 ガラスを分厚くして重厚感を出す
          roughness={0.04}         // 🚨 ツルツルに磨き上げる
          transmission={1.0} 
          ior={1.52}               // 🚨 屈折率を本物のガラスレベルまで引き上げる
          chromaticAberration={0.08} // 🚨 色収差でフチに虹色の宝石感を出す
          distortion={0.5}            
          color="#d0e8ff"          // 🚨 ほんのり青白いガラス
          attenuationColor="#001133" // 🚨 光が届かない部分は深い黒青に沈む
          attenuationDistance={2.0} 
          envMapIntensity={1.5}    // 🚨 艶と反射を強調
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </Sphere>
    </group>
  )
}