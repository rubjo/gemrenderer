// ── The GemSpec: one stone, described by its parts ────────────────────────
// gemrenderer renders a *spec*, not a named gemstone. A spec says what the
// stone is made of — body colour, cut, optical constants, presentation pose —
// and nothing about what it's called or what it means. The ten real gemstones
// the library grew up around now live in `gemrenderer/presets` as specs built
// from these same fields; nothing in the core knows the word "sapphire".
//
//   import { GemView } from 'gemrenderer'
//
//   new GemView('#mount', {
//     color: 0x0f4c81,                    // body colour (sRGB hex)
//     cut: { family: 'brilliant', pear: 0.95, sx: 0.88, sz: 0.82 },
//     ior: 1.77, fire: 0.41,              // optics (fire = dispersion, diamond = 1)
//     clarity: 8,
//   })
//
// Fields:
//   color      body colour, sRGB hex number (e.g. 0x0f4c81) — the only required
//              field; everything else has a sensible default.
//   cut        { family, ...params } — the faceting. `family` is one of
//              'brilliant' | 'step' | 'trilliant' | 'cabochon'; the rest are the
//              family's silhouette/profile knobs (see cuts.js). Defaults to a
//              plain round brilliant.
//   ior        refractive index (drives Fresnel + the bend of the light path).
//   fire       dispersion relative to diamond's (1.0) — the per-channel IOR
//              spread that makes the chromatic fire.
//   glow       colour of the fire light inside the stone; null → derived from
//              `color`.
//   bright     per-stone brilliance multiplier (env sparkle + inner fire).
//   orb        { light, base, dark } CSS colours for the placeholder orb; null →
//              derived from `color`. Never affects the baked render.
//   restTilt   resting lean about the screen-x axis, in radians (silhouette cuts
//              present best tilted a few degrees back; a deep brilliant sits at 0).
//   restYaw    resting spin about the up axis before the tilt, in radians — aims
//              the cut's icon axis at the viewer. Defaults to BASE_YAW.
//   sizeBoost  multiplier on the resting stone's target height, so a hero stone
//              can sit a hair proud of the rest.

// The symmetry offset the rotationally-fat cuts (brilliants, step cuts) rest
// at — 22.5° turns a facet edge toward the camera. Mirror-symmetric
// silhouettes (pear, heart, …) override it with their own `restYaw`.
export const BASE_YAW = Math.PI / 8

export const CUT_DEFAULT = { family: 'brilliant' }

const DEFAULT_SPEC = {
  color: 0x4b8fc4,
  cut: CUT_DEFAULT,
  ior: 1.77,
  fire: 0.4,
  glow: null,
  bright: 1,
  orb: null,
  restTilt: 0,
  restYaw: BASE_YAW,
  sizeBoost: 1,
}

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
const mix = (a, b, t) => a + (b - a) * t
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)))

// `0xaabbcc` → `'#aabbcc'` (for CSS-side use of a spec's colours).
export function hexString(n) {
  return `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`
}
const toHex = (r, g, b) =>
  `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')}`

// A placeholder orb, if the caller didn't give one: a highlight lifted toward
// white, the body colour, and a shade pulled toward black.
function deriveOrb(color) {
  const [r, g, b] = rgb(color)
  return {
    light: toHex(mix(r, 255, 0.55), mix(g, 255, 0.55), mix(b, 255, 0.55)),
    base: toHex(r, g, b),
    dark: toHex(r * 0.5, g * 0.5, b * 0.5),
  }
}

// A fire-light colour, if the caller didn't give one: the body colour lifted
// toward white so the stone's interior reads as light, not flat body colour.
function deriveGlow(color) {
  const [r, g, b] = rgb(color)
  return (
    (clamp255(mix(r, 255, 0.35)) << 16) |
    (clamp255(mix(g, 255, 0.35)) << 8) |
    clamp255(mix(b, 255, 0.35))
  )
}

// Fill a partial spec out to a complete one: defaults applied, `cut` normalised
// to `{ family, ...params }`, and the derived colours resolved. Idempotent and
// pure — every public entry point funnels its input through here, so the cache
// signatures below see a stable shape no matter how terse the call was.
export function resolveSpec(spec = {}) {
  const s = { ...DEFAULT_SPEC, ...spec }
  const cut = { family: 'brilliant', ...(s.cut || {}) }
  const color = Number(s.color)
  return {
    ...s,
    color: Number.isFinite(color) ? color : DEFAULT_SPEC.color,
    cut,
    glow:
      s.glow == null
        ? deriveGlow(Number.isFinite(color) ? color : DEFAULT_SPEC.color)
        : s.glow,
    orb:
      s.orb || deriveOrb(Number.isFinite(color) ? color : DEFAULT_SPEC.color),
  }
}

export function resolveClarity(clarity) {
  return Math.min(9, Math.max(0, Math.round(Number(clarity) || 0)))
}

// ── Cache signatures ──
// The renderer caches at three layers, each keyed by exactly the fields that
// layer depends on, so stones share work wherever they can:
//   geomSig   the raw geometry — the cut alone (shape is colour/pose-blind).
//   frameSig  the fitted crop rect — geometry plus the resting pose, since the
//             crop is the union of the stone's silhouette over a drag's poses.
//             Colour- and clarity-blind, so every tint/clarity of one cut shares
//             the expensive alpha-bounds search.
//   gemSig    a baked stone — the full optical identity (combined with clarity
//             by the caller). `orb` and `sizeBoost` are CSS-only, so they stay
//             out and never split the image cache.
// A spec must be resolved (defaults filled) before it's signed.
export function geomSig(s) {
  return JSON.stringify(s.cut)
}
export function frameSig(s) {
  return `${geomSig(s)}|${s.restTilt}|${s.restYaw}`
}
export function gemSig(s) {
  return `${frameSig(s)}|${s.color}|${s.ior}|${s.fire}|${s.bright}|${s.glow}`
}
