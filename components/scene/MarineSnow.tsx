'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export function MarineSnow({ 
  variant = 'near', progress = 0, descent = 0, windSpeed = 0, rainAmount = 0, clouds = 0,
  isSuspended = false, resonancePulse = 0 
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const localTime = useRef(0) 
  const timeScale = useRef(1.0) 
  
  const prevPulse = useRef(resonancePulse)
  const blastForce = useRef(0)
  
  const count = variant === 'near' ? 350 : 1200
  
  const [positions, randoms] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const rnd = new Float32Array(count * 3)
    
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 20 
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20 
      pos[i * 3 + 2] = variant === 'near' ? (Math.random() * 6 - 2) : (Math.random() * -15 - 3)
      
      rnd[i * 3 + 0] = Math.random() * Math.PI * 2
      rnd[i * 3 + 1] = 0.2 + Math.random() * 0.8
      rnd[i * 3 + 2] = 0.5 + Math.random() * 1.5
    }
    return [pos, rnd]
  }, [count, variant])

  const shaderArgs = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uDescent: { value: 0 },
      uOpacity: { value: variant === 'near' ? 0.6 : 0.3 },
      uWind: { value: 0 },   
      uDepth: { value: 0 },
      uBlast: { value: 0 }
    },
    vertexShader: `
      uniform float uTime;
      uniform float uDescent;
      uniform float uWind;
      uniform float uDepth;
      uniform float uBlast;
      attribute vec3 aRandom;
      varying float vAlpha;

      void main() {
        vec3 pos = position;

        float fallSpeed = -0.15 * aRandom.y * (1.0 - uDepth * 0.6);
        float diveSpeed = 5.0 * uDescent * aRandom.y;
        pos.y += uTime * (fallSpeed + diveSpeed);

        float surfaceTurbulence = uWind * 0.08 * (1.0 - uDepth);
        float baseSway = 0.4 * aRandom.z;
        pos.x += sin(uTime * 0.3 * aRandom.y + aRandom.x) * (baseSway + surfaceTurbulence);
        pos.z += cos(uTime * 0.2 * aRandom.y + aRandom.x) * (baseSway + surfaceTurbulence);

        pos.y = mod(pos.y + 10.0, 20.0) - 10.0;

        // 🚨 シャープな衝撃波
        vec3 dirToCenter = normalize(pos);
        float distToCenter = length(pos);
        float blastOffset = smoothstep(15.0, 0.0, distToCenter) * pow(uBlast, 0.3) * 30.0;
        pos += dirToCenter * blastOffset;

        vec4 mvPosition = viewMatrix * modelMatrix * vec4(pos, 1.0);
        
        float distToCamera = -mvPosition.z; 
        float focusDist = 4.5; 
        float blur = abs(distToCamera - focusDist) * 0.25; 
        
        float baseSize = 25.0 * aRandom.z * (1.0 - uDepth * 0.4);
        float pointSize = baseSize + (blur * 30.0);
        
        gl_PointSize = pointSize * (20.0 / distToCamera); 
        gl_Position = projectionMatrix * mvPosition;

        float energyConservation = 1.0 / (1.0 + blur * 2.0);
        float depthFade = 1.0 - smoothstep(12.0, 20.0, distToCamera);
        
        float blastFade = 1.0 - smoothstep(0.0, 0.3, uBlast);
        vAlpha = energyConservation * depthFade * blastFade;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying float vAlpha;
      
      void main() {
        vec2 xy = gl_PointCoord.xy - vec2(0.5);
        float ll = dot(xy, xy);

        float intensity = exp(-16.0 * ll);
        float core = exp(-60.0 * ll) * 0.6;

        if (intensity < 0.001) discard;

        vec3 color = vec3(0.85, 0.95, 1.0);
        
        gl_FragColor = vec4(color, (intensity + core) * vAlpha * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending 
  }), [variant])

  useFrame((_, delta) => {
    const targetScale = isSuspended ? 0.1 : 1.0
    timeScale.current = THREE.MathUtils.lerp(timeScale.current, targetScale, delta * 2.0)
    localTime.current += delta * timeScale.current

    if (resonancePulse > prevPulse.current) {
      blastForce.current = 1.0; 
      prevPulse.current = resonancePulse;
    }
    // 🚨 雪が7〜8秒かけて、ゆっくりと美しい元の空間に修復されていく
    blastForce.current = THREE.MathUtils.lerp(blastForce.current, 0, delta * 0.45);

    if (pointsRef.current) {
      const mat = pointsRef.current.material as THREE.ShaderMaterial
      mat.uniforms.uTime.value = localTime.current
      mat.uniforms.uDescent.value = THREE.MathUtils.lerp(mat.uniforms.uDescent.value, descent, 0.1)
      mat.uniforms.uWind.value = THREE.MathUtils.lerp(mat.uniforms.uWind.value, windSpeed, 0.05)
      mat.uniforms.uDepth.value = THREE.MathUtils.lerp(mat.uniforms.uDepth.value, progress, 0.05)
      mat.uniforms.uBlast.value = blastForce.current
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aRandom" args={[randoms, 3]} />
      </bufferGeometry>
      <shaderMaterial args={[shaderArgs]} />
    </points>
  )
}