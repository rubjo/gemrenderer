// The GitHub Pages demo: every stone on the ladder, a featured stone you can
// drag, and a panel wired to the knobs the library actually exposes. The ten
// stones come from the optional presets entry; the core renders plain specs.
import { GemView, configure, getConfig } from '../src/index.js'
import {
  GEM_ORDER,
  GEM_LABELS,
  GEM_CUT_NAMES,
  gemSpec,
} from '../src/presets.js'

const $ = (id) => document.getElementById(id)
const reduceMotion = window.matchMedia?.(
  '(prefers-reduced-motion: reduce)',
)?.matches

let featured = 'diamond'

// ── the stones ──
const heroView = new GemView('#hero', {
  ...gemSpec(featured),
  clarity: +$('clarity').value,
  autoSpin: !reduceMotion,
  spinRate: 0.5,
  shadow: $('shadow').checked,
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
  cells.set(gem, { cell, name, cut, view: null })
}
for (const [gem, c] of cells) {
  c.view = new GemView(c.cell.querySelector('.mount'), {
    ...gemSpec(gem),
    clarity: +$('clarity').value,
    shadow: $('shadow').checked,
  })
}

function feature(gem) {
  featured = gem
  heroView.update({ ...gemSpec(gem) })
  for (const [key, c] of cells) c.cell.setAttribute('aria-pressed', key === gem)
  describe()
}

function describe() {
  const clarity = +$('clarity').value
  $('hero-name').textContent = GEM_LABELS[featured]
  $('hero-cut').textContent = `${GEM_CUT_NAMES[featured]} · clarity ${clarity}`
  $('status').textContent =
    `${getConfig().tracer ? 'ray-traced' : 'rasterised'} · clarity ${clarity}`
}

// ── the panel ──
// Knobs that change how a stone is *baked* drop the cached stones, so a slider
// drags through a few values before it's worth re-rendering ten of them.
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
  document.documentElement.style.setProperty('--tile', `${px}px`)
  $('hero').style.width = `${Math.min(px * 2.4, 460)}px`
})

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
  describe()
})

chips('stage', (chip) => {
  document.body.dataset.stage = chip.dataset.stage
})

$('auto').addEventListener('change', (e) =>
  heroView.update({ autoSpin: e.target.checked }),
)

$('shadow').addEventListener('change', (e) => {
  const shadow = e.target.checked
  heroView.update({ shadow })
  for (const c of cells.values()) c.view.update({ shadow })
})

$('labels').addEventListener('change', (e) => {
  for (const c of cells.values())
    for (const el of [c.name, c.cut])
      el.style.visibility = e.target.checked ? '' : 'hidden'
})

document.documentElement.style.setProperty('--tile', `${$('size').value}px`)
feature(featured)
