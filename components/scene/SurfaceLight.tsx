'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// 頭上の海面から差し込む光。潜るほど遠く・暗くなり、浮上の直前にまた近づいてくる。
// 曇天の海では弱く、快晴の海では明るい
export function SurfaceLight({ progress, clouds, outro }: { progress: number, clouds: number, outro: number }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const intensity = useRef(0)

  const shaderArgs = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;

      void main() {
        vec2 p = vUv - vec2(0.5, 0.62);
        // 横に広い楕円のにじみ（海面）
        float glow = exp(-(p.x * p.x * 5.0 + p.y * p.y * 22.0));
        // 下へ伸びるかすかな光の筋（ゆっくり揺れる）
        float rays = 0.5 + 0.5 * sin(vUv.x * 38.0 + sin(uTime * 0.15 + vUv.x * 6.0) * 2.0);
        rays *= smoothstep(0.95, 0.2, vUv.y) * smoothstep(0.0, 0.5, vUv.y) * exp(-p.x * p.x * 6.0);
        float a = (glow + rays * 0.18) * uIntensity;
        gl_FragColor = vec4(vec3(0.62, 0.84, 1.0) * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  useFrame((state, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const depth = THREE.MathUtils.clamp(progress, 0, 1)
    const target = (Math.pow(1 - depth, 1.6) * 1.2 + 0.08 + outro * 0.6) * (1 - (clouds / 100) * 0.5)
    intensity.current = THREE.MathUtils.lerp(intensity.current, target, Math.min(1, delta * 0.5))
    const mat = mesh.material as THREE.ShaderMaterial
    mat.uniforms.uIntensity.value = intensity.current
    mat.uniforms.uTime.value = state.clock.elapsedTime
    // 深くなるほど海面は上へ遠ざかり、小さくなる
    // 浅いうちは光の中心が画面の上端あたり、深くなると上へ抜けて見えなくなっていく
    const recede = depth * (1 - outro)
    mesh.position.y = 3.0 + recede * 1.6
    const s = 1 - recede * 0.35
    mesh.scale.set(s, s, 1)
  })

  return (
    <mesh ref={meshRef} position={[0, 3.0, -6]} renderOrder={-1}>
      <planeGeometry args={[22, 9]} />
      <shaderMaterial args={[shaderArgs]} />
    </mesh>
  )
}
