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
    
    // 🚨 白飛びを防ぐため、ベースカラーをしっかり残してノイズを馴染ませる
    vec3 finalColor = mix(uBaseColor * 0.8, iridescenceColor * 0.6, smoothstep(0.0, 1.0, uRelease + 0.2));
    
    // 🚨 共鳴時（長押し解放時）のみ、淡く発光させる
    finalColor += vec3(0.5, 0.8, 1.0) * uResonance * 0.6;

    gl_FragColor = vec4(finalColor, 0.95);
  }
`

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
    const cold = new THREE.Color('#0033aa') 
    const hot = new THREE.Color('#00aa88')  
    return new THREE.Color().lerpColors(cold, hot, colorRatio)
  }, [colorRatio])

  const outerColors = useMemo(() => {
    const cold = new THREE.Color('#aaddff')
    const hot = new THREE.Color('#aaffdd')
    return new THREE.Color().lerpColors(cold, hot, colorRatio)
  }, [colorRatio])

  const lightIntensity = useMemo(() => THREE.MathUtils.lerp(0.8, 0.3, clouds / 100), [clouds])
  const waterMurkiness = useMemo(() => Math.max(0.0, THREE.MathUtils.lerp(0.0, 0.1, Math.min(rainAmount / 5, 1))), [rainAmount])

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
    // 🚨 フラッシュの減衰を早めて白飛び時間を短くする
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 5.0)
    
    const time = state.clock.elapsedTime
    const depthHardening = THREE.MathUtils.clamp((progress - 0.5) / 0.5, 0, 1)

    if (karmaMatRef.current) {
      const uniforms = karmaMatRef.current.uniforms
      uniforms.uTime.value = time
      const targetAge = Math.min(1.0, diveTimeMs / 36000000)
      uniforms.uAge.value = THREE.MathUtils.lerp(uniforms.uAge.value, targetAge, 0.02)
      const targetRelease = Math.min(1.0, releaseCount / 100)
      uniforms.uRelease.value = THREE.MathUtils.lerp(uniforms.uRelease.value, targetRelease, 0.02)
      uniforms.uResonance.value = flashEnergy.current

      if (isCharging) {
        uniforms.uBaseColor.value.lerp(new THREE.Color('#020202'), 0.1)
      } else {
        uniforms.uBaseColor.value.lerp(baseEmissive, 0.05)
      }
    }

    if (outerMatRef.current) {
      const flashAtten = new THREE.Color('#ffffff') 
      outerMatRef.current.attenuationColor.lerpColors(outerColors, flashAtten, flashEnergy.current)
      
      // 🚨 白濁を抑え、ガラスのように透き通らせる
      const baseMurkiness = waterMurkiness + (turbidity * 0.5) 
      outerMatRef.current.roughness = THREE.MathUtils.lerp(outerMatRef.current.roughness, baseMurkiness, 0.1)

      outerMatRef.current.temporalDistortion = THREE.MathUtils.lerp(0.1 + flashEnergy.current, 0.0, depthHardening)
      outerMatRef.current.distortion = THREE.MathUtils.lerp(0.2 + flashEnergy.current, 0.5, depthHardening)
      outerMatRef.current.ior = THREE.MathUtils.lerp(1.15, 1.3, depthHardening)
    }

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.1
      groupRef.current.rotation.z = Math.sin(time * 0.4) * 0.05

      const wobbleX = 1 + Math.sin(time * 0.7) * 0.015
      const wobbleY = 1 + Math.cos(time * 0.8) * 0.015
      const wobbleZ = 1 + Math.sin(time * 0.9) * 0.015

      // 🚨 サイズを中央で大きく堂々としたものに設定（1.2基準）
      const baseScale = 1.2 - (progress * 0.1)
      const chargeScale = isCharging ? -0.05 : 0 
      const flashExpand = flashEnergy.current * 0.05
      const vibrate = isCharging ? Math.sin(time * 50) * 0.005 : 0

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

  return (
    <group 
      ref={groupRef} 
      scale={1.2} 
      position={[0, 0, 0]}
      onPointerDown={(e) => { e.stopPropagation(); if (onChargeStart) onChargeStart(); }}
      onPointerUp={(e) => { e.stopPropagation(); if (onChargeStop) onChargeStop(); }}
      onPointerOut={(e) => { e.stopPropagation(); if (onChargeStop) onChargeStop(); }}
    >
      {/* 🚨 光を抑え、白飛びを防止 */}
      <ambientLight intensity={lightIntensity * 0.4} />
      <directionalLight position={[5, 5, 2]} intensity={lightIntensity * 0.6} color="#8fd8ff" />
      <Environment preset="night" />

      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
        <Sphere args={[0.55, 64, 64]}> 
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
          thickness={0.5}          // 🚨 屈折を薄くして中をクリアに見せる
          roughness={0.05}         // 🚨 表面を磨き上げる
          transmission={1.0} 
          ior={1.15}               // 🚨 屈折率を下げて白飛びを防ぐ
          chromaticAberration={0.02}  
          distortion={0.1}            
          color="#ffffff" 
          attenuationColor={outerColors} 
          attenuationDistance={10.0} // 🚨 光を遠くまで通す
          envMapIntensity={0.5}       
        />
      </Sphere>
    </group>
  )
}