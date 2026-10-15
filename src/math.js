// ── Small math helpers ─────────────────────────────────────────────────────
export const TAU = Math.PI * 2

export function clamp(v, min, max) {
  if (v < min) return min
  if (v > max) return max
  return v
}

export function lerpDt(k, dt) {
  const t = Math.min(dt, 0.1)
  return 1 - Math.exp(-k * t)
}

export function roundToTau(x) {
  if (!Number.isFinite(x)) return 0
  return Math.round(x / TAU) * TAU
}
