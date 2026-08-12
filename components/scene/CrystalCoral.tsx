'use client'

import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber' 
import { Sphere, MeshTransmissionMaterial, Float, Environment } from '@react-three/drei'
import * as THREE from 'three'
import type { DeepSeaCanvasProps } from './DeepSeaCanvas'

export type CrystalCoralProps = DeepSeaCanvasProps

const karmaVertexShader = `
  uniform float uTime;
  uniform float uAge;       
  uniform float uResonance; 
  uniform float uCharge;
  uniform float uFlash; 

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

  void main() {
    vUv = uv;
    vec3 p = position;
    float l1_norm = abs(p.x) + abs(p.y) + abs(p.z);
    vec3 octahedron = (p / l1_norm) * 1.2; 
    
    vec3 morphedPos = mix(p, octahedron, smoothstep(0.0, 1.0, uAge));
    
    float turbulence = (noise(p * 10.0 + uTime * 30.0) - 0.5) * 0.4 * uCharge;
    float shockwave = sin(length(p) * 20.0 - uTime * 20.0) * 0.15 * pow(uFlash, 1.5);
    float pulse = sin(uTime * 10.0) * 0.05 * uResonance;
    float condense = -0.1 * uCharge;
    
    morphedPos += normal * (pulse + turbulence + shockwave + condense);

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
  uniform float uFlash;      
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
    
    float flameNoise = noise(p * 15.0 - vec3(0.0, uTime * 20.0, 0.0));
    vec3 flameBase = vec3(0.01, 0.02, 0.05); 
    vec3 flameHot = vec3(0.9, 0.1, 0.2);     
    vec3 darkFlame = mix(flameBase, flameHot, smoothstep(0.2, 0.8, flameNoise));
    
    // 🚨 光量を適切にコントロール
    vec3 chargeGlow = darkFlame * uCharge * 3.0; 
    vec3 pulseGlow = vec3(0.3, 0.8, 1.0) * uFlash * 1.5;
    float core = smoothstep(0.7, 0.0, length(vNormal.xy)) * uFlash * 2.5;

    finalColor += pulseGlow + chargeGlow + vec3(core);

    // 🚨 白飛び・黒シミ防止のトーンマッピング（Reinhard）
    // これにより、どんなに眩しい光が重なってもPBRレンダリングが破綻しません
    finalColor = finalColor / (finalColor + vec3(0.5));
    finalColor *= 1.2; // 少し明るさを取り戻す

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
  const chargeLevel = useRef(0)

  const { viewport } = useThree() 

  const surfaceColor = useMemo(() => {
    const tRatio = THREE.MathUtils.clamp((temp + 10) / 40, 0, 1) 
    const cold = new THREE.Color('#001133') 
    const hot = new THREE.Color('#0055aa')  
    return new THREE.Color().lerpColors(cold, hot, tRatio)
  }, [temp])

  const deepColor = useMemo(() => new THREE.Color('#000511'), [])

  const lightIntensity = useMemo(() => THREE.MathUtils.lerp(1.2, 0.5, clouds / 100), [clouds])

  const karmaUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAge: { value: 0 },
    uRelease: { value: 0 },
    uResonance: { value: 0 },
    uCharge: { value: 0 },
    uFlash: { value: 0 }, 
    uBaseColor: { value: surfaceColor.clone() }
  }), [surfaceColor])

  useFrame((state, delta) => {
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0 
      prevPulse.current = resonancePulse
    }
    
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 0.8)
    const targetCharge = isCharging ? 1.0 : 0.0
    chargeLevel.current = THREE.MathUtils.lerp(chargeLevel.current, targetCharge, delta * (isCharging ? 1.5 : 4.0))

    const time = state.clock.elapsedTime
    const depthHardening = THREE.MathUtils.clamp((progress - 0.5) / 0.5, 0, 1)

    if (karmaMatRef.current) {
      const uniforms = karmaMatRef.current.uniforms
      uniforms.uTime.value = time
      uniforms.uAge.value = THREE.MathUtils.lerp(uniforms.uAge.value, Math.min(1.0, diveTimeMs / 36000000), 0.02)
      uniforms.uRelease.value = THREE.MathUtils.lerp(uniforms.uRelease.value, Math.min(1.0, releaseCount / 100), 0.02)
      
      uniforms.uResonance.value = flashEnergy.current
      uniforms.uCharge.value = chargeLevel.current
      uniforms.uFlash.value = flashEnergy.current

      const currentEnvironmentColor = surfaceColor.clone().lerp(deepColor, progress)

      if (isCharging) {
        uniforms.uBaseColor.value.lerp(new THREE.Color('#110005'), 0.1) 
      } else if (isTuning) {
        const targetHue = 0.5 + (tuningValue / 100) * 0.4
        const tuneColor = new THREE.Color().setHSL(targetHue, 1.0, 0.4)
        uniforms.uBaseColor.value.lerp(tuneColor, 0.15)
      } else {
        uniforms.uBaseColor.value.lerp(currentEnvironmentColor, 0.05)
      }
    }

    if (outerMatRef.current) {
      const baseColor = new THREE.Color('#000511')    
      const chargeColor = new THREE.Color('#110005')  
      const flashColor = new THREE.Color('#44ccff') // 🚨 眩しすぎない、美しいシアン
      
      const currentColor = baseColor.clone().lerp(chargeColor, chargeLevel.current)
      currentColor.lerp(flashColor, flashEnergy.current)
      outerMatRef.current.attenuationColor.copy(currentColor)
      
      const baseDist = 2.0 
      const targetDist = THREE.MathUtils.lerp(baseDist, 3.0, chargeLevel.current)
      
      // 🚨 無限遠まで光を逃がさないように上限を6.0でカット（黒バグを防止）
      outerMatRef.current.attenuationDistance = THREE.MathUtils.lerp(targetDist, 6.0, flashEnergy.current) 
      
      // 🚨 粗さ（Roughness）を絶対に 0.0 にしない（0.015が下限）ことで、マテリアルの計算破綻を防ぐ
      outerMatRef.current.roughness = THREE.MathUtils.lerp(0.06, 0.015, flashEnergy.current)
      
      const pressureDistortion = THREE.MathUtils.lerp(0.8, 0.2, progress)
      outerMatRef.current.distortion = THREE.MathUtils.lerp(pressureDistortion, 1.0, chargeLevel.current) + (flashEnergy.current * 0.5)
    }

    if (groupRef.current) {
      const spinSpeed = isTuning ? 1.5 : (isCharging ? 4.0 : 0.1) 
      groupRef.current.rotation.y += delta * spinSpeed
      groupRef.current.rotation.z = Math.sin(time * 0.4) * 0.05

      const wobbleX = 1 + Math.sin(time * 0.7) * 0.015
      const wobbleY = 1 + Math.cos(time * 0.8) * 0.015
      const wobbleZ = 1 + Math.sin(time * 0.9) * 0.015

      const responsiveScale = viewport.aspect < 1.0 ? 0.7 : 1.0
      
      const pressureShrink = 1.0 - (progress * 0.15)
      const baseScale = pressureShrink * responsiveScale
      
      const chargeShrink = chargeLevel.current * -0.15 * responsiveScale
      // 🚨 膨張を少し抑えめにし、締まりのあるシャープな解放を演出
      const flashExpand = flashEnergy.current * 0.3 * responsiveScale
      
      const aftershock = flashEnergy.current * Math.sin(time * 40.0) * 0.02 * responsiveScale
      const vibrate = isCharging ? Math.sin(time * 80) * 0.015 * responsiveScale : 0
      const tuneExpand = isTuning ? Math.sin(time * 15) * 0.02 * responsiveScale : 0

      groupRef.current.scale.lerp(
        new THREE.Vector3(
          baseScale * wobbleX + chargeShrink + flashExpand + vibrate + tuneExpand + aftershock, 
          baseScale * wobbleY + chargeShrink + flashExpand + vibrate + tuneExpand + aftershock, 
          baseScale * wobbleZ + chargeShrink + flashExpand + vibrate + tuneExpand + aftershock
        ), 
        delta * 6 
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
      <ambientLight intensity={lightIntensity * 0.5} />
      <directionalLight position={[5, 10, 5]} intensity={lightIntensity * 1.5} color="#ffffff" />
      <pointLight position={[-3, 0, 3]} intensity={1.0} color="#8fd8ff" />
      <Environment preset="night" />

      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
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
          thickness={2.5}          
          roughness={0.06}         
          transmission={1.0} 
          ior={1.52}               
          chromaticAberration={0.08} 
          distortion={0.5}            
          color="#ffffff"          
          attenuationColor="#000511" 
          attenuationDistance={2.0}  
          envMapIntensity={1.5}    
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </Sphere>
    </group>
  )
}