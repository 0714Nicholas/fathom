'use client'

/**
 * Fathom :: per-identity crystal seed
 *
 * Goal:
 *   - Deterministic per selfId (or any author id).
 *   - Cheap. No crypto hashes inside render loops.
 *   - Aesthetically narrow. We never want a "red" or "neon" crystal.
 *     The acceptable hue band is roughly:
 *       cyan (180°) → blue (215°) → indigo (250°) → muted violet (275°)
 *
 * Everything here is pure. Same input → same output, every time.
 */

export type CrystalIdentity = {
  /** Raw 32-bit unsigned hash from djb2. Useful for further derivations. */
  hash: number

  /** Geometry detail. Integer in [1, 5]. */
  detail: number

  /** Base radius multiplier. Around 1.0, narrowly perturbed. */
  scale: number

  /** Hue in degrees, restricted to the Fathom-safe arc. */
  hueDeg: number

  /** Saturation 0..1 (kept low — these are quiet objects). */
  saturation: number

  /** Lightness 0..1 (kept moderate). */
  lightness: number

  /** Surface roughness for MeshPhysicalMaterial. */
  roughness: number

  /** Transmission for MeshPhysicalMaterial. */
  transmission: number

  /** Thickness for MeshPhysicalMaterial. */
  thickness: number

  /** Index of refraction. */
  ior: number

  /** Subtle base emissive intensity. */
  emissiveBoost: number

  /** Slight rotation bias on Y, in radians per second. */
  rotationDriftY: number

  /** Slight rotation bias on X, in radians per second. */
  rotationDriftX: number

  /** Speed of ambient pulse (Hz-ish). */
  pulseSpeed: number

  /** Amplitude of ambient pulse. */
  pulseAmp: number
}

// ---------------------------------------------------------------------------
// djb2 :: tiny, fast, well-known string hash
// ---------------------------------------------------------------------------
export function djb2(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    // h * 33 ^ c
    h = ((h << 5) + h) ^ str.charCodeAt(i)
  }
  // Force to unsigned 32-bit
  return h >>> 0
}

// Mulberry32 :: deterministic PRNG seeded by an integer.
// We use this to derive *several* values from one hash without correlation.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

/**
 * Map a deterministic 0..1 sample to a discrete detail tier.
 * Most crystals should be moderately detailed; the tail (1 or 5) is rare.
 */
function pickDetail(u: number): number {
  // Distribution roughly:  10% : 25% : 35% : 22% : 8%
  if (u < 0.1) return 1
  if (u < 0.35) return 2
  if (u < 0.7) return 3
  if (u < 0.92) return 4
  return 5
}

/**
 * Compose a full CrystalIdentity from an arbitrary string id.
 * Pass selfId for "your crystal".
 * Pass any author id for "their crystal" (future heatmap, etc.).
 */
export function makeCrystalIdentity(id: string): CrystalIdentity {
  // Salt prevents accidental collisions with unrelated djb2 usages elsewhere.
  const hash = djb2(`fathom:crystal:${id}`)
  const rand = mulberry32(hash)

  // Each call below consumes one independent stream sample.
  const uDetail      = rand()
  const uScale       = rand()
  const uHue         = rand()
  const uSat         = rand()
  const uLight       = rand()
  const uRough       = rand()
  const uTrans       = rand()
  const uThick       = rand()
  const uIor         = rand()
  const uEmissive    = rand()
  const uRotY        = rand()
  const uRotX        = rand()
  const uPulseSpeed  = rand()
  const uPulseAmp    = rand()

  // ---------- Geometry -----------------------------------------------------
  const detail = pickDetail(uDetail)
  // Scale band: 0.94 .. 1.07 — never dramatic, just personal
  const scale = lerp(0.94, 1.07, uScale)

  // ---------- Color band ---------------------------------------------------
  // Hue stays in 180° (cyan) .. 275° (muted violet).
  // We intentionally avoid 290°+ (pink), 0° / 360° (red), 30°..150° (warm).
  const hueDeg = lerp(180, 275, uHue)

  // Saturation: 0.42 .. 0.62 — never saturated, never gray
  const saturation = lerp(0.42, 0.62, uSat)

  // Lightness: 0.55 .. 0.72 — pale but legible
  const lightness = lerp(0.55, 0.72, uLight)

  // ---------- Material -----------------------------------------------------
  // Roughness: 0.12 .. 0.28
  const roughness = lerp(0.12, 0.28, uRough)
  // Transmission: 0.78 .. 0.96
  const transmission = lerp(0.78, 0.96, uTrans)
  // Thickness: 1.05 .. 1.6
  const thickness = lerp(1.05, 1.6, uThick)
  // IOR: 1.17 .. 1.28
  const ior = lerp(1.17, 1.28, uIor)
  // Emissive boost: 0.06 .. 0.16
  const emissiveBoost = lerp(0.06, 0.16, uEmissive)

  // ---------- Motion -------------------------------------------------------
  // Per-identity rotation drift, both signs allowed but tiny.
  const rotationDriftY = lerp(0.085, 0.16, uRotY) * (uRotY > 0.5 ? 1 : -1) * 0.5
  const rotationDriftX = lerp(0.02, 0.07, uRotX) * (uRotX > 0.5 ? 1 : -1)

  // Pulse speed: 0.85 .. 1.35 Hz-ish
  const pulseSpeed = lerp(0.85, 1.35, uPulseSpeed)
  // Pulse amplitude: 0.014 .. 0.024
  const pulseAmp = lerp(0.014, 0.024, uPulseAmp)

  return {
    hash,
    detail,
    scale: clamp(scale, 0.9, 1.12),
    hueDeg,
    saturation,
    lightness,
    roughness,
    transmission,
    thickness,
    ior,
    emissiveBoost,
    rotationDriftY,
    rotationDriftX,
    pulseSpeed,
    pulseAmp,
  }
}

/**
 * Convenience: derive a *slightly shifted* emissive hue for resonance pulses.
 * We don't want resonance to be the same hue as ambient light — it should
 * feel like the same crystal speaking, but a little brighter.
 */
export function resonanceHueShift(identity: CrystalIdentity): number {
  // Push 8° toward cyan, but stay inside the safe arc.
  const shifted = identity.hueDeg - 8
  return clamp(shifted, 178, 275)
}
