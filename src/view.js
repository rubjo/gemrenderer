// ── GemView: a stone in a box, framework-free ─────────────────────────────
// Mounts a gemstone into any element: a soft orb placeholder while the render
// loads, then the baked PNG, then a live canvas the moment you drag it. No
// framework, no build step, one shared WebGL context across every view on the
// page (see renderer.js).
//
//   import { GemView } from 'gemrenderer'
//
//   const gem = new GemView('#mount', {
//     color: 0xa6001a,                       // body colour (sRGB hex)
//     cut: { family: 'brilliant', poly: 4 }, // a square brilliant
//     ior: 1.77, fire: 0.41,
//     clarity: 9,
//   })
//   gem.update({ clarity: 7 })
//   gem.destroy()
//
// The view renders a *spec* (see spec.js) — colour, cut, optics, pose — and
// knows nothing about named gemstones; the ten the library ships live in
// `gemrenderer/presets` and spread straight into these options. The box is
// sized by the *consumer's* CSS (the stone scales to fit its mount's width);
// the view only writes the sizing custom properties. A caption, if you want
// one, is yours to render beside the mount — it's out of the view's scope.

import { resolveSpec, resolveClarity, gemSig } from './spec.js'
import {
  getGemImage,
  getGemRestPad,
  getGemSizing,
  renderGemFrame,
} from './renderer.js'
import { clarityScale, onConfigChange } from './options.js'
import { createGemSpin } from './spin.js'
import { injectGemStyles } from './styles.js'

// The options that describe the *stone* (everything else tunes the view).
const SPEC_KEYS = [
  'color',
  'cut',
  'ior',
  'fire',
  'glow',
  'bright',
  'orb',
  'restTilt',
  'restYaw',
  'sizeBoost',
]
const pickSpec = (o) => {
  const s = {}
  for (const k of SPEC_KEYS) if (o[k] !== undefined) s[k] = o[k]
  return s
}

const DEFAULTS = {
  clarity: 9,
  balance: true, // pad above/below equally; false insets against a sibling
  shadow: true, // CSS drop-shadow under the stone
  interactive: true, // drag to spin, Enter/Space to select
  autoSpin: false, // turntable until switched off
  spinRate: 0.45, // rad/s for autoSpin
  onSelect: null, // (state) => void — also fired as a `gemselect` event
  styles: true, // inject the stock stylesheet once
  ariaLabel: 'gemstone — drag to spin', // a11y only; not a visible caption
}

export class GemView {
  constructor(mount, options = {}) {
    const el = typeof mount === 'string' ? document.querySelector(mount) : mount
    if (!el) throw new Error('gemrenderer: mount element not found')
    if (options.styles !== false) injectGemStyles()

    this.opts = { ...DEFAULTS, ...options }
    this.spec = resolveSpec(pickSpec(this.opts))
    this.el = el
    this.el.classList.add('gr-mount')
    this._job = 0 // bump to drop in-flight image loads after an update()

    this.mount = document.createElement('span')
    this.mount.className = 'gr-wrap'
    this.el.appendChild(this.mount)

    this.imgUrl = ''
    this.canvas = null
    this.live = false // a gesture (or turntable) has taken over from the PNG
    this.spin = createGemSpin({
      draw: (y, x) =>
        renderGemFrame(this.canvas, this.spec, y, x, this.clarity),
      canSpin: () => !!this.imgUrl && !!this.opts.interactive,
      onCommit: async () => {
        this.live = true
        this.showCanvas()
        // One frame of layout so the canvas knows its box before drawing.
        await new Promise((r) => requestAnimationFrame(() => r()))
      },
      onTap: () => this.select(),
    })

    this._bind()
    // A `configure()` anywhere on the page re-bakes mounted stones, so a
    // brightness or fire dial on a demo panel takes effect live.
    this._offConfig = onConfigChange(() => this.render())
    this.render()
  }

  get clarity() {
    return resolveClarity(this.opts.clarity)
  }

  /** Current resolved spec + clarity (what events carry). */
  state() {
    return { ...this.spec, clarity: this.clarity, el: this.el }
  }

  select() {
    this.opts.onSelect?.(this.state())
    this.el.dispatchEvent(
      new CustomEvent('gemselect', { detail: this.state(), bubbles: true }),
    )
  }

  /** Change options in place: `{ color, cut, clarity, autoSpin, ... }`. */
  update(options = {}) {
    const before = `${gemSig(this.spec)}:${this.clarity}`
    Object.assign(this.opts, options)
    this.spec = resolveSpec(pickSpec(this.opts))
    // Only a new stone (colour/cut/optics/pose) or clarity needs a fresh bake;
    // a shadow or balance toggle is pure CSS.
    const identity = `${gemSig(this.spec)}:${this.clarity}` !== before
    this._accessibility()
    this.render(!identity)
  }

  /** Stop all work and drop the DOM this view created (the mount stays). */
  destroy() {
    this._job++
    this._offConfig?.()
    this.spin.destroy()
    this.mount.remove()
    this.el.classList.remove('gr-mount')
    this.el.removeAttribute('data-shadow')
  }

  // ── internals ──

  _bind() {
    const m = this.mount
    m.addEventListener('pointerdown', (e) => this.spin.down(e))
    m.addEventListener('pointermove', (e) => this.spin.move(e))
    m.addEventListener('pointerup', () => this.spin.up())
    m.addEventListener('pointercancel', () => this.spin.up())
    m.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        this.select()
      }
    })
    this._accessibility()
  }

  _accessibility() {
    const m = this.mount
    if (this.opts.interactive) {
      m.setAttribute('role', 'button')
      m.tabIndex = 0
      m.setAttribute('aria-label', this.opts.ariaLabel || 'gemstone')
    } else {
      m.removeAttribute('role')
      m.removeAttribute('tabindex')
      m.removeAttribute('aria-label')
    }
  }

  /** Re-read sizing + pads and push them into custom properties. */
  _vars() {
    const { fit, target, aspect } = getGemSizing(this.spec)
    const { top, bottom } = this.imgUrl
      ? getGemRestPad(this.spec, this.clarity)
      : { top: 0, bottom: 0 }
    const inset = this.opts.balance ? 0 : (1 - target) / 2
    const s = this.el.style
    s.setProperty('--gr-fit', String(fit))
    s.setProperty('--gr-aspect', String(aspect))
    s.setProperty(
      '--gr-mb',
      String(this.opts.balance ? (top - bottom) * fit : inset - bottom * fit),
    )
    s.setProperty('--gr-origin-y', String(top * fit + target / 2))
    s.setProperty('--gr-scale', String(clarityScale(this.clarity)))

    const orb = this.spec.orb
    s.setProperty('--gr-light', orb.light)
    s.setProperty('--gr-base', orb.base)
    s.setProperty('--gr-dark', orb.dark)
    this.el.dataset.shadow = this.opts.shadow ? 'on' : 'off'
  }

  showOrb() {
    this.canvas = null
    this.mount.innerHTML = '<span class="gr-orb" aria-hidden="true"></span>'
  }

  showImage(url) {
    this.canvas = null
    this.mount.innerHTML = `<img class="gr-gem" src="${url}" alt="" draggable="false">`
    this.mount.classList.toggle('gr-grab', !!this.opts.interactive)
  }

  showCanvas() {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'gr-gem'
    this.canvas.setAttribute('aria-hidden', 'true')
    this.mount.replaceChildren(this.canvas)
    // A stone that goes straight to a live canvas (an autoSpin hero never shows
    // the static PNG) still needs the grab affordance — the grab cursor and
    // `touch-action: pan-y` that make a drag land as a spin on touch devices.
    this.mount.classList.toggle('gr-grab', !!this.opts.interactive)
  }

  /**
   * Load the baked stone for the current spec+clarity (or reuse the current
   * one) and hand it to the view. Without WebGL the image stays null and the
   * orb placeholder holds the space — the view never breaks, it just stays flat.
   */
  render(keepImage = false) {
    this._vars()
    const job = ++this._job
    // A live canvas is the user's gesture — never trade it back for the orb
    // or the PNG while it's spinning; the next frame simply repaints it.
    if (!keepImage && !this.live) this.showOrb()
    const load =
      keepImage && this.imgUrl
        ? Promise.resolve(this.imgUrl)
        : getGemImage(this.spec, this.clarity)
    load.then((url) => {
      if (job !== this._job) return
      this.imgUrl = url || ''
      if (!url) this.showOrb()
      else if (this.live) {
        this.showCanvas() // fresh backing store for the new stone
        this.spin.set() // repaint at the current rotation
      } else this.showImage(url)
      this._vars() // pads + ratio are only known once the frame is fitted
    })
    this.spin.auto(!!this.opts.autoSpin, this.opts.spinRate)
  }
}
