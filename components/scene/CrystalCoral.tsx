'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, MeshTransmissionMaterial, Float, Environment } from '@react-three/drei'
import * as THREE from 'three'
import type { DeepSeaCanvasProps } from './DeepSeaCanvas'

// 外部から渡ってくるPropsを拡張
export type CrystalCoralProps = DeepSeaCanvasProps & {
  isCharging?: boolean
  turbidity?: number
  diveTimeMs?: number
  releaseCount?: number
  onChargeStart?: () => void
  onChargeStop?: () => void
}

// --------------------------------------------------------
// 魂のコア（Karma）を司るWebGLシェーダー
// --------------------------------------------------------
const karmaVertexShader = `
  uniform float uTime;
  uniform float uAge;       
  uniform float uResonance; 

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec3 p = position;
    
    // 球体から正八面体へモーフ
    float l1_norm = abs(p.x) + abs(p.y) + abs(p.z);
    vec3 octahedron = (p / l1_norm) * 1.2; 
    
    vec3 morphedPos = mix(p, octahedron, smoothstep(0.0, 1.0, uAge));
    
    // 呼吸と共鳴
    float pulse = sin(uTime * 5.0) * 0.05 * uResonance;
    morphedPos += normal * pulse;

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
  uniform vec3 uBaseColor;   

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  // FBM Noise
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

    vec3 p = vWorldPosition * (2.0 + uRelease * 6.0) + uTime * 0.1;
    float fbmNoise = noise(p) * 0.5 + noise(p * 2.0) * 0.25;
    
    float fresnel = max(0.0, dot(normal, viewDir));
    float interference = fresnel + (fbmNoise * uRelease * 2.0);
    
    vec3 a = vec3(0.5); vec3 b = vec3(0.5); vec3 c = vec3(1.0);
    vec3 d = vec3(0.0, 0.33, 0.67) + (uTime * 0.05);
    
    vec3 iridescenceColor = palette(interference, a, b, c, d);
    vec3 finalColor = mix(uBaseColor * 0.3, iridescenceColor, smoothstep(0.0, 1.0, uRelease));
    
    finalColor += vec3(0.8, 0.9, 1.0) * uResonance * (0.4 + fbmNoise * 0.6);

    float alpha = clamp(0.9 + (uResonance * 0.1), 0.0, 1.0);
    gl_FragColor = vec4(finalColor, alpha);
  }
`

// --------------------------------------------------------
// メインコンポーネント
// --------------------------------------------------------
export function CrystalCoral({ 
  progress = 0, windSpeed = 0, clouds = 0, rainAmount = 0, resonancePulse = 0, temp = 15,
  diveTimeMs = 0, releaseCount = 0, isCharging = false, turbidity = 0,
  onChargeStart, onChargeStop
}: CrystalCoralProps) {
  
  const outerMatRef = useRef<any>(null)
  const groupRef = useRef<THREE.Group>(null)
  const karmaMatRef = useRef<THREE.ShaderMaterial>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)

  const colorRatio = useMemo(() => THREE.MathUtils.clamp((temp + 10) / 45, 0, 1), [temp])
  const baseEmissive = useMemo(() => {
    const cold = new THREE.Color('#0044ff') 
    const hot = new THREE.Color('#00ff66')  
    return new THREE.Color().lerpColors(cold, hot, colorRatio)
  }, [colorRatio])

  const outerColors = useMemo(() => {
    const cold = new THREE.Color('#88ccff')
    const hot = new THREE.Color('#88ffcc')
    return new THREE.Color().lerpColors(cold, hot, colorRatio)
  }, [colorRatio])

  const lightIntensity = useMemo(() => THREE.MathUtils.lerp(1.2, 0.4, clouds / 100), [clouds])
  const waterMurkiness = useMemo(() => Math.max(0.05, THREE.MathUtils.lerp(0.05, 0.2, Math.min(rainAmount / 5, 1))), [rainAmount])

  const karmaUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAge: { value: 0 },
    uRelease: { value: 0 },
    uResonance: { value: 0 },
    uBaseColor: { value: baseEmissive.clone() }
  }), [baseEmissive])

  useFrame((state, delta) => {
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 0.4)
    
    const time = state.clock.elapsedTime
    const depthHardening = THREE.MathUtils.clamp((progress - 0.5) / 0.5, 0, 1)

    // 1. コアの更新
    if (karmaMatRef.current) {
      const uniforms = karmaMatRef.current.uniforms
      uniforms.uTime.value = time
      
      const targetAge = Math.min(1.0, diveTimeMs / 36000000) // 例:10時間で完成
      uniforms.uAge.value = THREE.MathUtils.lerp(uniforms.uAge.value, targetAge, 0.02)
      
      const targetRelease = Math.min(1.0, releaseCount / 100) // 例:100回で完成
      uniforms.uRelease.value = THREE.MathUtils.lerp(uniforms.uRelease.value, targetRelease, 0.02)
      
      uniforms.uResonance.value = flashEnergy.current

      if (isCharging) {
        uniforms.uBaseColor.value.lerp(new THREE.Color('#050505'), 0.1)
      } else {
        uniforms.uBaseColor.value.lerp(baseEmissive, 0.05)
      }
    }

    // 2. ガラスの更新
    if (outerMatRef.current) {
      const flashAtten = new THREE.Color('#ffffff') 
      outerMatRef.current.attenuationColor.lerpColors(outerColors, flashAtten, flashEnergy.current)

      const baseMurkiness = waterMurkiness + (turbidity * 0.8) // 濁度の適用
      outerMatRef.current.roughness = THREE.MathUtils.lerp(outerMatRef.current.roughness, baseMurkiness, 0.1)

      const baseDistortion = 0.4 + (windSpeed * 0.06) + (isCharging ? 0.5 : 0)
      const currentTemporalDistortion = 0.2 + (windSpeed * 0.05) + flashEnergy.current * 1.5
      outerMatRef.current.temporalDistortion = THREE.MathUtils.lerp(currentTemporalDistortion, 0.0, depthHardening)
      outerMatRef.current.distortion = THREE.MathUtils.lerp(baseDistortion + flashEnergy.current * 1.5, 0.8, depthHardening)

      outerMatRef.current.ior = THREE.MathUtils.lerp(1.2, 1.45, depthHardening)
      outerMatRef.current.thickness = THREE.MathUtils.lerp(1.5, 5.0, depthHardening)
    }

    // 3. 全体アニメーション
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15
      groupRef.current.rotation.z = Math.sin(time * 0.4) * 0.05

      const wobbleX = 1 + Math.sin(time * 0.7) * 0.025 + Math.sin(time * 1.3) * 0.015
      const wobbleY = 1 + Math.cos(time * 0.8) * 0.025 + Math.cos(time * 1.4) * 0.015
      const wobbleZ = 1 + Math.sin(time * 0.9) * 0.025 + Math.cos(time * 1.5) * 0.015

      const baseScale = 0.55 - (progress * 0.03)
      const chargeScale = isCharging ? -0.1 : 0 
      const flashExpand = flashEnergy.current * 0.15
      const vibrate = isCharging ? Math.sin(time * 50) * 0.01 : 0

      groupRef.current.scale.lerp(
        new THREE.Vector3(
          baseScale * wobbleX + flashExpand + chargeScale + vibrate, 
          baseScale * wobbleY + flashExpand + chargeScale + vibrate, 
          baseScale * wobbleZ + flashExpand + chargeScale + vibrate
        ), 
        delta * 5
      )
    }
  })

  // 🚨 ポインターイベント（触覚）の登録
  return (
    <group 
      ref={groupRef} 
      scale={0.55} 
      position={[0, -0.2, 0]}
      onPointerDown={(e) => { e.stopPropagation(); if (onChargeStart) onChargeStart(); }}
      onPointerUp={(e) => { e.stopPropagation(); if (onChargeStop) onChargeStop(); }}
      onPointerOut={(e) => { e.stopPropagation(); if (onChargeStop) onChargeStop(); }}
    >
      <ambientLight intensity={lightIntensity * 0.5} />
      <directionalLight position={[5, 5, 2]} intensity={lightIntensity} color="#8fd8ff" />
      <Environment preset="night" />

      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <Sphere args={[0.55, 64, 64]}> 
          <shaderMaterial
            ref={karmaMatRef}
            args={[{
              uniforms: karmaUniforms,
              vertexShader: karmaVertexShader,
              fragmentShader: karmaFragmentShader,
              transparent: true,
              blending: THREE.AdditiveBlending,
              depthWrite: false
            }]}
          />
        </Sphere>
      </Float>

      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={1.5}    
          roughness={waterMurkiness}      
          transmission={1.0} 
          ior={1.2}               
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