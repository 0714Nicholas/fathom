'use client'

import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const MAX_COMPANIONS = 24
const GOLDEN_ANGLE = 2.399963
// DeepSeaCanvas のカメラ（z = 4.5、縦の画角 45°）に合わせた値
const CAMERA_Z = 4.5
const HALF_FOV = (45 / 2) * (Math.PI / 180)

// 一緒に潜っている人の灯り。マリンスノー（青白く落ちていく粒）と区別できるよう、
// 暖かい色で、その場でゆっくり明滅する（一緒に沈んでいるので、自分から見ると止まって見える）
export function CompanionLights({ count }: { count: number }) {
  const pointsRef = useRef<THREE.Points>(null)
  const alphaRef = useRef(new Float32Array(MAX_COMPANIONS))

  const { size } = useThree()
  const aspect = size.width / Math.max(1, size.height)

  const seeds = useMemo(() => {
    const seeds = new Float32Array(MAX_COMPANIONS * 3)
    for (let i = 0; i < MAX_COMPANIONS; i++) {
      seeds[i * 3 + 0] = Math.random() * Math.PI * 2
      seeds[i * 3 + 1] = 0.5 + Math.random() * 0.8
      seeds[i * 3 + 2] = 0.75 + Math.random() * 0.5
    }
    return seeds
  }, [])

  // 黄金角で散らし、自分の灯り（結晶）の輪郭のすぐ外側に、奥行きをずらして置く。
  // 結晶の後ろに隠れず、画面からもはみ出さないように、画面の縦横比に合わせて計算する（人が増えても既存の灯りは動かない）
  const positions = useMemo(() => {
    const positions = new Float32Array(MAX_COMPANIONS * 3)
    const crystalScale = aspect < 1 ? 0.7 : 1.0
    for (let i = 0; i < MAX_COMPANIONS; i++) {
      const z = -2.5 - (i % 7) * 0.9
      const dist = CAMERA_Z - z
      const silhouette = 1.2 * crystalScale * (dist / CAMERA_Z)
      const halfH = Math.tan(HALF_FOV) * dist * 0.88
      const halfW = halfH * aspect
      const r = silhouette * (1.15 + (i % 5) * 0.08)
      const angle = i * GOLDEN_ANGLE
      const x = THREE.MathUtils.clamp(Math.cos(angle) * r, -halfW, halfW)
      let y = Math.sin(angle) * r
      if (x * x + y * y < r * r) y = (y >= 0 ? 1 : -1) * Math.sqrt(r * r - x * x)
      positions[i * 3 + 0] = x
      positions[i * 3 + 1] = THREE.MathUtils.clamp(y, -halfH, halfH)
      positions[i * 3 + 2] = z
    }
    return positions
  }, [aspect])

  const shaderArgs = useMemo(() => ({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      uniform float uTime;
      attribute vec3 aSeed;
      attribute float aAlpha;
      varying float vAlpha;

      void main() {
        vec3 pos = position;
        pos.x += sin(uTime * 0.25 * aSeed.y + aSeed.x) * 0.18;
        pos.y += cos(uTime * 0.2 * aSeed.y + aSeed.x) * 0.12;

        vec4 mvPosition = viewMatrix * modelMatrix * vec4(pos, 1.0);
        float dist = -mvPosition.z;
        gl_PointSize = 26.0 * aSeed.z * (20.0 / dist);
        gl_Position = projectionMatrix * mvPosition;

        // ゆっくりした呼吸のような明滅
        float breath = 0.75 + 0.25 * sin(uTime * 0.6 * aSeed.y + aSeed.x * 3.0);
        vAlpha = aAlpha * breath;
      }
    `,
    fragmentShader: `
      varying float vAlpha;

      void main() {
        vec2 xy = gl_PointCoord.xy - vec2(0.5);
        float ll = dot(xy, xy);
        float halo = exp(-14.0 * ll) * 0.55;
        float core = exp(-120.0 * ll);
        float intensity = halo + core;
        if (intensity < 0.002) discard;
        vec3 color = mix(vec3(1.0, 0.78, 0.52), vec3(1.0, 0.95, 0.85), core);
        gl_FragColor = vec4(color, intensity * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  useFrame((state, delta) => {
    const points = pointsRef.current
    if (!points) return
    const visible = Math.min(MAX_COMPANIONS, Math.max(0, count))
    const alphas = alphaRef.current
    for (let i = 0; i < MAX_COMPANIONS; i++) {
      const target = i < visible ? 1 : 0
      alphas[i] = THREE.MathUtils.lerp(alphas[i], target, Math.min(1, delta * 0.8))
    }
    const attr = points.geometry.getAttribute('aAlpha') as THREE.BufferAttribute
    attr.needsUpdate = true
    ;(points.material as THREE.ShaderMaterial).uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry key={aspect.toFixed(2)}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[seeds, 3]} />
        <bufferAttribute attach="attributes-aAlpha" args={[alphaRef.current, 1]} />
      </bufferGeometry>
      <shaderMaterial args={[shaderArgs]} />
    </points>
  )
}
