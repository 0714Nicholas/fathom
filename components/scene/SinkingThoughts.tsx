'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const POOL = 12
const LIFE_SEC = 7

type Mote = { born: number, x: number, drift: number, alive: boolean }

// 「沈める」たびに、灯りから小さな粒が離れて深海へ沈んでいく
export function SinkingThoughts({ pulse }: { pulse: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const motes = useRef<Mote[]>(Array.from({ length: POOL }, () => ({ born: 0, x: 0, drift: 0, alive: false })))
  const nextSlot = useRef(0)
  const clockRef = useRef(0)
  const lastPulse = useRef(pulse)

  const geometry = useMemo(() => new THREE.SphereGeometry(0.045, 12, 12), [])
  const materials = useMemo(
    () => Array.from({ length: POOL }, () => new THREE.MeshBasicMaterial({ color: '#7d8ea3', transparent: true, opacity: 0, depthWrite: false })),
    []
  )

  useEffect(() => {
    if (pulse === lastPulse.current) return
    lastPulse.current = pulse
    const slot = nextSlot.current
    nextSlot.current = (slot + 1) % POOL
    motes.current[slot] = { born: clockRef.current, x: (Math.random() - 0.5) * 0.5, drift: (Math.random() - 0.5) * 0.4, alive: true }
  }, [pulse])

  useFrame((state) => {
    clockRef.current = state.clock.elapsedTime
    const group = groupRef.current
    if (!group) return
    group.children.forEach((child, i) => {
      const mote = motes.current[i]
      const mat = materials[i]
      if (!mote.alive) {
        mat.opacity = 0
        return
      }
      const t = (clockRef.current - mote.born) / LIFE_SEC
      if (t >= 1) {
        mote.alive = false
        mat.opacity = 0
        return
      }
      // 結晶（半径 1.2）のすぐ下から離れ、ゆっくり加速しながら奥の暗がりへ沈んでいく
      child.position.set(mote.x + mote.drift * t, -1.25 - t * t * 2.4, 0.3 - t * 2.5)
      child.scale.setScalar(1 - t * 0.6)
      mat.opacity = Math.min(1, t * 6) * (1 - t) * 0.85
    })
  })

  return (
    <group ref={groupRef}>
      {materials.map((mat, i) => (
        <mesh key={i} geometry={geometry} material={mat} />
      ))}
    </group>
  )
}
