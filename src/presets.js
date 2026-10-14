// ── gemrenderer/presets ───────────────────────────────────────────────────
// The ten gemstones the library grew up around, now expressed as plain specs
// built from the generic core (color + cut family + optics + pose). The core
// itself knows none of these names; import this entry only if you want the
// ready-made ladder.
//
//   import { gemSpec } from 'gemrenderer/presets'
//   import { GemView } from 'gemrenderer'
//
//   new GemView('#mount', { ...gemSpec('sapphire'), clarity: 8 })
//
// Ordered lowest → highest value (the price-per-carat ladder of the rarest cut
// stones). Each stone pairs a deep, saturated body colour with one *distinct*
// faceting family and its real IOR / dispersion ("fire", relative to diamond's
// 1.0). The `label` and `cutName` are display metadata — the renderer never
// sees them (the core dropped captions from its scope).

import { BASE_YAW } from './spec.js'

// label + cutName are UI metadata; `spec` is what the renderer consumes. Pose
// fields left out fall back to the spec defaults (restTilt 0, restYaw BASE_YAW,
// sizeBoost 1).
const STONES = {
  benitoite: {
    label: 'Benitoite',
    cutName: 'Trilliant',
    spec: {
      color: 0x4169e1,
      glow: 0x7c9bff,
      orb: { light: '#a8bcff', base: '#4169e1', dark: '#1e3a8a' },
      cut: { family: 'trilliant', hc: 0.36, pd: 0.5 },
      ior: 1.75,
      fire: 0.41,
      restTilt: 0.42,
      restYaw: Math.PI,
      sizeBoost: 0.9,
    },
  },
  'red-beryl': {
    label: 'Red Beryl',
    cutName: 'Baguette',
    spec: {
      color: 0xe30b5c,
      glow: 0xff4d85,
      orb: { light: '#ffb3cd', base: '#e30b5c', dark: '#8f0639' },
      // Baguette: a long, nearly sharp-cornered step cut — shallow body, one
      // wide terrace, standing on its keel line.
      cut: { family: 'step', aspect: 2.2, cutAmt: 0.14, pavSteps: 1, hc: 0.32, pd: 0.38 },
      ior: 1.58,
      fire: 0.3,
      restTilt: 0.45,
      restYaw: 0,
      sizeBoost: 0.7,
    },
  },
  musgravite: {
    label: 'Musgravite',
    cutName: 'Asscher',
    spec: {
      color: 0x70536a,
      glow: 0xa98aa3,
      orb: { light: '#c4aabf', base: '#70536a', dark: '#463248' },
      // Asscher: the square step cut — small table, deep corner cuts.
      cut: { family: 'step', aspect: 1.0, cutAmt: 0.4, table: 0.42, hc: 0.46, pd: 0.5 },
      ior: 1.7,
      fire: 0.33,
      restTilt: 0.4,
      restYaw: 0,
      sizeBoost: 0.9,
    },
  },
  painite: {
    label: 'Painite',
    cutName: 'Marquise',
    spec: {
      color: 0x5c2016,
      glow: 0x9a4632,
      orb: { light: '#b0705f', base: '#5c2016', dark: '#38100a' },
      // Marquise: an elongated brilliant with pointed tips at both ends.
      cut: { family: 'brilliant', marquise: 0.45, sx: 1.12, sz: 0.62, hc: 0.34, pd: 0.42 },
      ior: 1.7,
      fire: 0.33,
      restTilt: 0.8,
      restYaw: 0,
      sizeBoost: 0.6,
    },
  },
  alexandrite: {
    label: 'Alexandrite',
    cutName: 'Heart',
    spec: {
      color: 0x556b2f,
      glow: 0x87a356,
      orb: { light: '#a3bd7d', base: '#556b2f', dark: '#33421c' },
      // Heart: the heart-curve silhouette brilliant.
      cut: { family: 'brilliant', heart: true, hc: 0.42, pd: 0.5 },
      ior: 1.747,
      fire: 0.34,
      restTilt: 1.05,
      restYaw: Math.PI / 2,
      sizeBoost: 0.95,
    },
  },
  paraiba: {
    label: 'Paraíba',
    cutName: 'Cabochon',
    spec: {
      color: 0x00e5ee,
      glow: 0x59f6ff,
      orb: { light: '#9df6fa', base: '#00c9d1', dark: '#027e86' },
      // Cabochon: the domed, unfaceted cut Paraíba tourmaline is known for.
      cut: { family: 'cabochon' },
      ior: 1.62,
      fire: 0.38,
      restTilt: 0.3,
      restYaw: BASE_YAW,
      sizeBoost: 0.85,
    },
  },
  sapphire: {
    label: 'Sapphire',
    cutName: 'Pear',
    spec: {
      color: 0x0f4c81,
      glow: 0x4b8fc4,
      orb: { light: '#86b8e0', base: '#0f4c81', dark: '#082f52' },
      // Pear: the teardrop brilliant — round lobe, single cusp tip.
      cut: { family: 'brilliant', pear: 0.95, sx: 0.88, sz: 0.82, hc: 0.4, pd: 0.5 },
      ior: 1.77,
      fire: 0.41,
      restTilt: 1.05,
      restYaw: Math.PI / 2,
      sizeBoost: 1.2,
    },
  },
  emerald: {
    label: 'Emerald',
    cutName: 'Emerald cut',
    spec: {
      color: 0x00a86b,
      glow: 0x2ee6a5,
      orb: { light: '#8ff0cd', base: '#00a86b', dark: '#00663f' },
      // Emerald cut: the step-cut profile at its most balanced.
      cut: { family: 'step', aspect: 1.45, hc: 0.42, pd: 0.48 },
      ior: 1.575,
      fire: 0.3,
      restTilt: 0.4,
      restYaw: BASE_YAW,
      sizeBoost: 0.9,
    },
  },
  ruby: {
    label: 'Ruby',
    cutName: 'Square brilliant',
    spec: {
      color: 0xa6001a,
      glow: 0xe4294a,
      orb: { light: '#ff8497', base: '#a6001a', dark: '#64000f' },
      // Square brilliant (princess): straight edges, sharp corners.
      cut: { family: 'brilliant', poly: 4, hc: 0.38, pd: 0.8 },
      ior: 1.77,
      fire: 0.41,
      restTilt: 0.15,
      restYaw: 0,
    },
  },
  diamond: {
    label: 'Diamond',
    cutName: 'Round brilliant',
    spec: {
      // Icy blue, not white — a neutral body reads gray against both light and
      // dark pages. `bright` lifts its env sparkle and fire so a diamond reads
      // as pure brilliance, lighter and flashier than the coloured stones.
      color: 0xe5f2ff,
      glow: 0xeef4ff,
      bright: 1.4,
      orb: { light: '#ffffff', base: '#c4d9ff', dark: '#8fb2f0' },
      cut: { family: 'brilliant' }, // the classic deep round brilliant
      ior: 2.417,
      fire: 1.0,
    },
  },
}

// name → renderable spec (the object you spread into GemView / the renderer).
export const GEM_SPECS = Object.fromEntries(
  Object.entries(STONES).map(([k, v]) => [k, v.spec]),
)

// The value ladder, lowest → highest.
export const GEM_ORDER = Object.keys(STONES)

export const GEM_DEFAULT = 'sapphire'

// Display metadata, keyed the same way as the specs.
export const GEM_LABELS = Object.fromEntries(
  GEM_ORDER.map((k) => [k, STONES[k].label]),
)
export const GEM_CUT_NAMES = Object.fromEntries(
  GEM_ORDER.map((k) => [k, STONES[k].cutName]),
)

// Any caller input (including typos / unknown names) collapses onto a real
// stone so no call site renders an undefined spec.
export function resolveGem(name) {
  return STONES[name] ? name : GEM_DEFAULT
}

// The renderable spec for a named stone (falls back to the default).
export function gemSpec(name) {
  return GEM_SPECS[resolveGem(name)]
}
