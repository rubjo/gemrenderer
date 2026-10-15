// ── Library-wide tuning ──────────────────────────────────────────────────
// Every knob that changes how a stone is *baked* lives here. Call
// `configure({ ... })` before the first render (or any time after — the
// caches are dropped and the affected stones re-render lazily), and read the
// live values back with `getConfig()`.
//
//   scale.baseHeight   resting stone height as a fraction of the mount's
//                      box width, shared by every cut
//   tracer             ray-traced light paths on/off (off falls back to the
//                      rasterised MeshPhysicalMaterial look)
//   exposure           global brightness, applied to both materials
//   dispersion         multiplier on chromatic fire (tracer only)
//   bounces            internal light paths per fragment; null ramps them
//                      with the clarity (3 at clarity 0 → 5 at clarity 9)
//   environment        intensity of the studio env map (physical material)
//   resolution         the square render frame in px (crop + headroom budget)

const DEFAULTS = {
  scale: {
    // 0.75 leaves ~12% air above and below the stone in its box. Raise to grow
    // every gem together.
    baseHeight: 0.75,
  },
  tracer: true,
  exposure: 1,
  dispersion: 1,
  bounces: null,
  environment: 0.18,
  resolution: 640,
}

export const config = structuredClone(DEFAULTS)

const listeners = new Set()

/** Subscribe to config changes; the callback runs after every `configure`. */
export function onConfigChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Merge options into the live config.
 *
 * @param {object} patch e.g. `{ exposure: 1.2, scale: { baseHeight: 0.8 } }`.
 *   `scale` merges key-by-key so callers can set one dial without restating
 *   the rest.
 * @returns {object} the live config object.
 */
export function configure(patch = {}) {
  let changed = false
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (key === 'scale') {
      const next = { ...config.scale, ...value }
      changed = changed || JSON.stringify(next) !== JSON.stringify(config.scale)
      Object.assign(config.scale, next)
    } else if (config[key] !== value) {
      config[key] = value
      changed = true
    }
  }
  if (changed) for (const fn of listeners) fn(config)
  return config
}

/** Reset every knob to the library defaults. */
export function resetConfig() {
  return configure(structuredClone(DEFAULTS))
}

/** A frozen snapshot of the current knobs (safe to log or serialise). */
export function getConfig() {
  return structuredClone(config)
}
