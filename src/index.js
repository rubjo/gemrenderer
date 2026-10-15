// ── gemrenderer ──────────────────────────────────────────────────────────
// A generic gemstone renderer: describe a stone by its parts — body colour, a
// cut family, real optical constants — and get ray-traced light paths in one
// shared WebGL context. See README.md for the tour; the ten
// ready-made stones live in `gemrenderer/presets`.

export {
  resolveSpec,
  resolveClarity,
  hexString,
  BASE_YAW,
  CUT_DEFAULT,
  geomSig,
  frameSig,
  gemSig,
} from './spec.js'
export { CUT_FAMILIES } from './cuts.js'
export { configure, getConfig, resetConfig, onConfigChange } from './options.js'
export {
  getGemImage,
  renderGemFrame,
  getGemSizing,
  getGemRestPad,
  heightRatio,
  invalidate,
  setTracerEnabled,
} from './renderer.js'
export { createGemSpin } from './spin.js'
export { GemView } from './view.js'
export { GEM_STYLES, injectGemStyles } from './styles.js'

export const VERSION = '0.2.0'
