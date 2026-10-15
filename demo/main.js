// The GitHub Pages demo: a sample of stones, a featured one you can drag, and a
// panel wired to the knobs the library actually exposes. The stones come from
// the optional presets entry; the core renders plain specs.
import { GemView, configure, getConfig } from '../src/index.js'
import {
  GEM_ORDER,
  GEM_LABELS,
  GEM_CUT_NAMES,
  gemSpec,
} from '../src/presets.js'
import { hexString } from '../src/spec.js'

const $ = (id) => document.getElementById(id)
const reduceMotion = window.matchMedia?.(
  '(prefers-reduced-motion: reduce)',
)?.matches

let featured = 'diamond'

// The glint bloom pass is off by default in the library; the demo showcases a
// subtle bloom so the facet sparkle reads the way it does in the reference photos.
configure({ glint: +$('glint').value })

// ── the custom stone ──
// There is no eleventh stone: the *featured* stone turns into "Custom" the
// moment a custom prop changes or Randomize is hit. Selecting a preset seeds
// these fields from it, so tweaking only the colour of a Ruby yields the
// Ruby's cut and colour, merely renamed — the cut's geometry/pose and optics
// are always borrowed from the preset that shows that cut off.
const custom = {
  color: $('gem-color').value,
  cut: 'diamond',
  fire: null,
  bright: null,
  bounces: null,
  glint: null,
}
const customSpec = () => {
  const s = {
    ...gemSpec(custom.cut),
    color: parseInt(custom.color.slice(1), 16),
    glow: null,
    orb: null,
  }
  // Only include optics the roll actually set — unrolled fields inherit the
  // page knobs (and the cut preset's own fire/bright).
  for (const k of ['fire', 'bright', 'bounces', 'glint'])
    if (custom[k] != null) s[k] = custom[k]
  return s
}
const specFor = (gem) => (gem === 'custom' ? customSpec() : gemSpec(gem))

// ── the stones ──
const heroView = new GemView('#hero', {
  ...gemSpec(featured),
  clarity: +$('clarity').value,
  autoSpin: !reduceMotion,
  spinRate: 0.5,
})

const grid = $('grid')
const cells = new Map()
for (const gem of GEM_ORDER) {
  const cell = document.createElement('div')
  cell.className = 'cell'
  const mount = document.createElement('div')
  mount.className = 'mount'
  const name = document.createElement('span')
  name.className = 'name'
  name.textContent = GEM_LABELS[gem]
  const cut = document.createElement('span')
  cut.className = 'cut'
  cut.textContent = GEM_CUT_NAMES[gem]
  cell.append(mount, name, cut)
  grid.appendChild(cell)

  // A tap on a stone (not a drag) bubbles up as `gemselect` — feature it.
  mount.addEventListener('gemselect', () => feature(gem))
  cells.set(gem, { cell, view: null })
}

for (const [gem, c] of cells) {
  c.view = new GemView(c.cell.querySelector('.mount'), {
    ...specFor(gem),
    clarity: +$('clarity').value,
  })
}

function feature(gem) {
  featured = gem
  if (gem !== 'custom') {
    // Selecting a preset hands its identity to the custom controls — colour,
    // cut, no rolled optics — so the next edit continues from *this* stone
    // and simply renames it Custom.
    custom.color = hexString(gemSpec(gem).color)
    $('gem-color').value = custom.color
    custom.cut = gem
    cutSel.value = gem
    custom.fire = null
    custom.bright = null
    custom.bounces = null
    custom.glint = null
  }
  heroView.update({ ...specFor(gem) })
  // No ladder cell is pressed while the Custom stone is featured.
  for (const [key, c] of cells) c.cell.setAttribute('aria-pressed', key === gem)
  describe()
}

function describe() {
  const clarity = +$('clarity').value
  const cutName =
    featured === 'custom' ? GEM_CUT_NAMES[custom.cut] : GEM_CUT_NAMES[featured]
  $('hero-name').textContent =
    featured === 'custom' ? 'Custom' : GEM_LABELS[featured]
  $('hero-cut').textContent = `${cutName} · clarity ${clarity}`
  $('status').textContent =
    `${getConfig().tracer ? 'ray-traced' : 'rasterised'} · clarity ${clarity}`
}

// ── the panel ──
// Knobs that change how a stone is *baked* drop the cached stones, so a slider
// drags through a few values before it's worth re-rendering all of them.
function debounce(fn, ms = 180) {
  let t = 0
  return (...a) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
}
const live = (fn) => {
  fn()
  return debounce(fn)
}

$('clarity').addEventListener('input', (e) => {
  $('clarity-out').value = e.target.value
  const clarity = +e.target.value
  heroView.update({ clarity })
  for (const c of cells.values()) c.view.update({ clarity })
  describe()
})

$('size').addEventListener('input', (e) => {
  const px = +e.target.value
  $('size-out').value = `${px}px`
  // Sizes only the featured stone; the ladder tiles are fixed (`--tile`).
  document.documentElement.style.setProperty('--hero', `${px}px`)
  // A live canvas only resizes its backing store when it next draws — poke
  // the hero (no re-bake, same stone) so a static featured stone repaints
  // crisp at the new size instead of stretching its old bitmap.
  repaintFeatured()
})
const repaintFeatured = debounce(() => heroView.update({}))

$('fire').addEventListener(
  'input',
  live(() => {
    const v = +$('fire').value
    $('fire-out').value = `${v.toFixed(2)}×`
    configure({ dispersion: v })
  }),
)

$('exposure').addEventListener(
  'input',
  live(() => {
    const v = +$('exposure').value
    $('exposure-out').value = `${v.toFixed(2)}×`
    configure({ exposure: v })
  }),
)

// The first stop leaves bounces to the clarity ladder; above it every stone
// traces the same number of internal light paths.
$('bounces').addEventListener(
  'input',
  live(() => {
    const v = +$('bounces').value
    $('bounces-out').value =
      v === 0 ? 'by clarity' : `${v} ${v === 1 ? 'bounce' : 'bounces'}`
    configure({ bounces: v === 0 ? null : v })
  }),
)

function chips(id, onPick) {
  const box = $(id)
  box.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip')
    if (!chip) return
    for (const c of box.querySelectorAll('.chip'))
      c.setAttribute('aria-pressed', c === chip)
    onPick(chip)
  })
}

chips('mode', (chip) => {
  configure({ tracer: chip.dataset.mode === 'traced' })
  syncTracerOnly()
  describe()
})

// Fire, light paths and glint tune the ray tracer's light transport; the
// rasterised fallback ignores them entirely, so the panel dims and disables
// those rows while `Rasterised` is active.
const tracerRows = [...document.querySelectorAll('.tracer-only')]
function syncTracerOnly() {
  const traced = getConfig().tracer
  for (const row of tracerRows) {
    row.classList.toggle('is-off', !traced)
    for (const input of row.querySelectorAll('input')) input.disabled = !traced
  }
}

chips('stage', (chip) => {
  document.body.dataset.stage = chip.dataset.stage
})

$('auto').addEventListener('change', (e) =>
  heroView.update({ autoSpin: e.target.checked }),
)

// Glint is a library knob, not a spec field: it re-bakes every stone (the
// tracer compiles its HDR output variant), so it rides `configure` alone.
$('glint').addEventListener(
  'input',
  live(() => {
    const v = +$('glint').value
    $('glint-out').value = `${v.toFixed(2)}×`
    configure({ glint: v })
  }),
)

// The cut picker offers the ladder's ten cuts; the value is the preset whose
// geometry + pose the custom stone borrows.
const cutSel = $('gem-cut')
for (const gem of GEM_ORDER) {
  const opt = document.createElement('option')
  opt.value = gem
  opt.textContent = GEM_CUT_NAMES[gem]
  cutSel.appendChild(opt)
}
cutSel.value = custom.cut

// Editing a custom prop (or Randomize) always features the custom stone —
// changing a knob you can see nothing happen on is just confusing.
const applyCustom = () => feature('custom')

// `debounce`, not `live`: these must not fire at registration, or the page
// would open featuring a Custom stone before the user touched anything.
$('gem-color').addEventListener(
  'input',
  debounce(() => {
    custom.color = $('gem-color').value
    applyCustom()
  }),
)

$('gem-cut').addEventListener(
  'change',
  debounce(() => {
    custom.cut = cutSel.value
    applyCustom()
  }),
)

// HSL → '#rrggbb' (the colour input only speaks hex). s/l are 0..1.
const hslToHex = (h, s, l) => {
  const f = (n) => {
    const k = (n + h / 30) % 12
    const a = s * Math.min(l, 1 - l)
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// Roll a new stone: any hue in the saturated mid-lightness band where gems
// read as gems rather than as mud or fog (body colours absorb light in the
// tracer, so very dark picks bake near-black too), a random cut — and its own
// optics. The per-spec fields (fire/bright) and per-spec overrides (bounces/
// glint) keep the roll on this stone only; the panel's knobs go on steering
// the presets exactly as before.
$('gem-random').addEventListener('click', () => {
  custom.color = hslToHex(
    Math.floor(Math.random() * 360),
    0.55 + Math.random() * 0.4,
    0.35 + Math.random() * 0.3,
  )
  $('gem-color').value = custom.color
  custom.cut = GEM_ORDER[Math.floor(Math.random() * GEM_ORDER.length)]
  cutSel.value = custom.cut
  // Dispersion relative to diamond (presets span ~0.3–1.0); a roll can
  // out-fire or barely-fire at all.
  custom.fire = +(0.15 + Math.random() * 1.25).toFixed(2)
  // Brilliance multiplier around the presets' 1.0–1.4 range.
  custom.bright = +(0.7 + Math.random() * 0.9).toFixed(2)
  // 3–8 internal light paths (the clarity ramp sits at ~5 for clarity 9).
  custom.bounces = 3 + Math.floor(Math.random() * 6)
  // A quarter of rolls skip the bloom pass entirely — not every gem flares.
  custom.glint =
    Math.random() < 0.25 ? 0 : +(0.1 + Math.random() * 0.9).toFixed(2)
  applyCustom()
})

// The controls sit in a collapsible panel. On small screens it starts closed so
// the featured stone is the first thing you see; on wide layouts it stays open.
const controls = $('controls')
const compact = matchMedia('(max-width: 880px)')
const syncPanel = () => {
  controls.open = !compact.matches
}
syncPanel()
compact.addEventListener?.('change', syncPanel)

document.documentElement.style.setProperty('--hero', `${$('size').value}px`)
feature(featured)
syncTracerOnly()
