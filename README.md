# gemrenderer

**A gemstone, described by its parts. Real faceting cuts, ray-traced light — in
the browser, in a framework you already have.**

![The gemrenderer demo: ten cut gemstones rendered in the browser](docs/preview.png)

You hand gemrenderer a **spec** — a body colour, a cut, real optical constants —
and it builds the stone as raw three.js geometry and traces each fragment's own
convex hull: Fresnel reflection, refraction in, total internal reflection,
refractive exit, with the three colour channels bent at slightly different IORs,
so **fire is a light path, not a painted tint** — and colour deepens along the
internal path by Beer–Lambert absorption from the body colour and the spec's IOR
and dispersion.

The core knows nothing about any named gemstone. The ten it grew up around
(benitoite … diamond) ship as ready-made specs in [`gemrenderer/presets`](#presets)
— import them if you want the ladder, or write your own stone from scratch.

- **Framework-free.** Vanilla DOM class, plus a pure-function core and a bare
  pointer gesture you can drive from Vue, React, Svelte or a `<script>` tag.
- **One WebGL context for the whole page.** Stones are baked once per spec +
  clarity and cached; static images and live spinners share the same meshes.
- **Graceful without WebGL.** No context, no crash — the mount keeps its
  placeholder and your layout keeps its shape.
- **No assets, no build step.** Plain ESM source and one procedural HDR studio.
- **MIT.**

## Demo

**[rubjo.github.io/gemrenderer](https://rubjo.github.io/gemrenderer/)** — every
preset stone on the ladder, drag to spin, and a panel wired to the live knobs
(clarity, fire, brightness, light paths, traced vs. rasterised shading, studio floor).

## Install

```bash
npm install gemrenderer three
```

`three` is a peer dependency (`>=0.163`) — use the version your app already
ships. The library pulls three in lazily, only when a stone actually renders.

```js
import { GemView } from 'gemrenderer'

// A stone from scratch — a square-cut deep-red brilliant:
new GemView('#mount', {
  color: 0xa6001a,
  cut: { family: 'brilliant', poly: 4 },
  ior: 1.77,
  fire: 0.41,
  clarity: 8,
})

// …or one of the ready-made presets:
import { gemSpec } from 'gemrenderer/presets'
new GemView('#mount', { ...gemSpec('ruby'), clarity: 8 })
```

…and that's the whole API for most people: an orb appears, the baked stone
replaces it, and the moment you drag it, it becomes a live canvas you can spin
freely on both axes — easing back to its resting pose when you let go.

## The spec

Every entry point renders a **GemSpec** — the stone's parts, nothing about what
it's called:

| field       | default         | what it does                                                           |
| ----------- | --------------- | ---------------------------------------------------------------------- |
| `color`     | —               | body colour, sRGB hex (`0x0f4c81`). The one field worth always setting. |
| `cut`       | round brilliant | `{ family, ...params }` — the faceting (see below)                     |
| `ior`       | `1.77`          | refractive index — the Fresnel + the bend of the light path            |
| `fire`      | `0.4`           | dispersion relative to diamond's `1.0` (the per-channel IOR spread)    |
| `glow`      | from `color`    | colour of the fire light inside the stone                              |
| `bright`    | `1`             | per-stone brilliance multiplier (env sparkle + inner fire)             |
| `orb`       | from `color`    | `{ light, base, dark }` CSS colours for the placeholder — never baked  |
| `restTilt`  | `0`             | resting lean about the screen-x axis, in radians                       |
| `restYaw`   | `BASE_YAW`      | resting spin about the up axis, in radians — aims the cut's icon axis  |
| `sizeBoost` | `1`             | multiplier on the resting target height, so a hero stone sits proud    |

`clarity` (0–9) is a separate sheen dial passed alongside the spec: it grows the
environment sparkle, the iridescent fire, the internal light paths and the
stone's size. It never changes _what_ the stone is — even clarity 0 traces real
refraction.

### Cut families

`cut.family` is one of four generic builders; the rest of `cut` is that family's
silhouette/profile knobs. One family covers a whole shelf of real cuts:

| family      | knobs                                            | makes                                                   |
| ----------- | ------------------------------------------------ | ------------------------------------------------------- |
| `brilliant` | `poly`, `sx`, `sz`, `marquise`, `pear`, `heart`, `hc`, `pd` | round, square (`poly: 4`), hexagon (`poly: 6`), oval (`sx`/`sz`), marquise, pear, heart |
| `step`      | `aspect`, `cutAmt`, `table`, `pavSteps`, `hc`, `pd` | emerald cut, asscher, baguette                          |
| `trilliant` | `hc`, `pd`                                       | the triangular brilliant                                |
| `cabochon`  | —                                                | the domed, unfaceted lathe                              |

`hc` is crown height, `pd` pavilion depth. `CUT_FAMILIES` is exported for UIs
that want to list them.

```js
new GemView('#mount', { color: 0x00a86b, cut: { family: 'step', aspect: 1.45 } }) // an emerald cut
```

## `GemView`

```js
const gem = new GemView(mount, options)
```

`mount` is an element or a selector. `options` is a spec (the fields above) plus
the view's own knobs below. The view owns its inner DOM and a small stylesheet
(injected once); your CSS controls the box it lives in. A **caption is out of
scope** — render your own label beside the mount if you want one.

| view option   | default                      | what it does                                                                    |
| ------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| `clarity`     | `9`                          | 0–9 sheen + size                                                                |
| `balance`     | `true`                       | pad above/below the stone equally; `false` insets it for baseline-aligned grids |
| `shadow`      | `true`                       | CSS drop-shadow under the stone                                                 |
| `interactive` | `true`                       | drag to spin, `Enter`/`Space` to select                                         |
| `autoSpin`    | `false`                      | turntable until switched off                                                    |
| `spinRate`    | `0.45`                       | rad/s for `autoSpin`                                                            |
| `onSelect`    | `null`                       | `(state) => void` — a tap (not a drag)                                          |
| `ariaLabel`   | `'gemstone — drag to spin'`  | accessibility label on the mount (not a visible caption)                        |
| `styles`      | `true`                       | inject the stock stylesheet                                                     |

**Methods**

```js
gem.update({ clarity: 4, color: 0x0f4c81 }) // change in place; re-bakes only on a new spec/clarity
gem.spin.auto(true, 0.8) // turntable at 0.8 rad/s
gem.spin.home() // ease back to the resting pose
gem.state() // the resolved spec + { clarity, el }
gem.destroy() // stop all work and remove the mount's children
```

**Events** — a tap (not a drag) fires on the mount and bubbles:

```js
document.querySelector('#mount').addEventListener('gemselect', (e) => {
  console.log(e.detail) // { color, cut, ior, fire, …, clarity, el }
})
```

`prefers-reduced-motion: reduce` is respected: released stones snap home instead
of easing, and a view built with `autoSpin` stays still.

### Sizing

The stone scales to the **width of its mount**, so size it with your own CSS
(`width`, a grid track, `clamp()`). The view writes the numbers it derives into
custom properties — override or extend them as you like:

| property               | meaning                                                 |
| ---------------------- | ------------------------------------------------------- |
| `--gr-fit`             | display scale that lands the stone on its target height |
| `--gr-aspect`          | fitted frame's width / height (locks the box early)     |
| `--gr-mb`              | bottom padding the frame carries, in box widths         |
| `--gr-origin-y`        | the stone's centre, for the clarity scale               |
| `--gr-scale`           | the clarity's size on the ladder                        |
| `--gr-light/base/dark` | the spec's placeholder-orb colours                      |

Or skip the stock sheet (`{ styles: false }`) and style `.gr-mount`, `.gr-wrap`,
`.gr-gem` and `.gr-orb` yourself.

## Presets

The ten gemstones the library grew up around, as ready-made specs:

```js
import { gemSpec, GEM_ORDER, GEM_LABELS, GEM_CUT_NAMES } from 'gemrenderer/presets'

new GemView('#mount', { ...gemSpec('sapphire'), clarity: 8 })
```

The value ladder, lowest → highest. Pass the key to `gemSpec(key)`.

| key           | label       | cut              | body colour |   IOR | fire |
| ------------- | ----------- | ---------------- | ----------- | ----: | ---: |
| `benitoite`   | Benitoite   | Trilliant        | `#4169e1`   | 1.750 | 0.41 |
| `red-beryl`   | Red Beryl   | Baguette         | `#e30b5c`   | 1.580 | 0.30 |
| `musgravite`  | Musgravite  | Asscher          | `#70536a`   | 1.700 | 0.33 |
| `painite`     | Painite     | Marquise         | `#5c2016`   | 1.700 | 0.33 |
| `alexandrite` | Alexandrite | Heart            | `#556b2f`   | 1.747 | 0.34 |
| `paraiba`     | Paraíba     | Cabochon         | `#00e5ee`   | 1.620 | 0.38 |
| `sapphire`    | Sapphire    | Pear             | `#0f4c81`   | 1.770 | 0.41 |
| `emerald`     | Emerald     | Emerald cut      | `#00a86b`   | 1.575 | 0.30 |
| `ruby`        | Ruby        | Square brilliant | `#a6001a`   | 1.770 | 0.41 |
| `diamond`     | Diamond     | Round brilliant  | `#e5f2ff`   | 2.417 | 1.00 |

`gemSpec(key)` returns the renderable spec (unknown keys fall back to the
default). `GEM_LABELS` and `GEM_CUT_NAMES` are display metadata for your own
captions — the core renderer never sees them. `GEM_SPECS` is the full map and
`GEM_ORDER` the ladder order.

## Options that change the render

```js
import { configure, getConfig, resetConfig } from 'gemrenderer'

configure({ dispersion: 1.4, exposure: 1.1 }) // every mounted stone re-renders
```

| knob                | default | what it does                                                          |
| ------------------- | ------- | --------------------------------------------------------------------- |
| `tracer`            | `true`  | ray-traced light paths; `false` = rasterised `MeshPhysicalMaterial`   |
| `exposure`          | `1`     | global brightness                                                     |
| `dispersion`        | `1`     | chromatic fire (the per-channel IOR spread)                           |
| `bounces`           | `null`  | internal light paths per fragment; `null` ramps them with the clarity |
| `environment`       | `0.18`  | studio env-map intensity (rasterised path)                            |
| `resolution`        | `640`   | the square render frame, in px                                        |
| `scale.baseHeight`  | `0.75`  | resting stone height as a fraction of the mount's width               |
| `scale.clarityStep` | `0.96`  | size ladder per clarity (`1` = every clarity the same size)           |

These are library-wide; a stone's own size nudge is its spec's `sizeBoost`.
Knobs that change how a stone is baked drop the cached stones; mounted views
re-render themselves, so a settings panel is live. The expensive part — the
fitted frame per cut — survives shading changes and only re-calibrates when the
stone's shape on the canvas changes.

## Lower-level API

For rendering into your own DOM, or your own interaction model — every call
takes a spec:

```js
import {
  getGemImage, // (spec, clarity) => Promise<dataURL | null>, cached per spec+clarity
  renderGemFrame, // (canvas, spec, rotY, rotX, clarity) => Promise<void>
  getGemSizing, // (spec) => { target, fit, aspect }
  getGemRestPad, // (spec, clarity) => { top, bottom }
  heightRatio, // () => number — the configured stone height
  clarityScale, // (clarity) => number — the ladder multiplier
  invalidate, // ({ frames }) => void — drop baked stones
  setTracerEnabled, // (bool) => void — shorthand for configure({ tracer })
  createGemSpin, // drag/tap gesture, framework-free
  resolveSpec, // (partial) => a complete spec (defaults + derived colours)
  CUT_FAMILIES,
} from 'gemrenderer'
```

```js
import { gemSpec } from 'gemrenderer/presets'

// Just the image, no interaction:
const url = await getGemImage(gemSpec('emerald'), 6)
img.src = url // null without WebGL — keep your own placeholder

// Your own spin UI:
const spec = { color: 0x00a86b, cut: { family: 'step' }, ior: 1.575 }
const spin = createGemSpin({
  draw: (rotY, rotX) => renderGemFrame(canvas, spec, rotY, rotX, 6),
  onCommit: async () => {
    showCanvas() // called once, before the first live frame
    await oneFrameOfLayout()
  },
  onTap: () => openDetails(),
})
wrap.addEventListener('pointerdown', spin.down)
wrap.addEventListener('pointermove', spin.move)
wrap.addEventListener('pointerup', spin.up)
```

`createGemSpin` keeps a press a _tap_ (and the page's vertical scroll alive)
until it clearly commits to a drag, leaves the spin unbounded on both axes, and
eases back to the nearest full turn on release. `spin.auto(true)` gives you a
turntable without a gesture.

### In a framework

The core is just functions, so a wrapper is a few lines:

```vue
<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { createGemSpin, getGemImage, renderGemFrame } from 'gemrenderer'

const props = defineProps({
  spec: Object, // a GemSpec (e.g. from gemrenderer/presets)
  clarity: { type: Number, default: 2 },
})
const img = ref('')
const live = ref(false)
const canvas = ref(null)
getGemImage(props.spec, props.clarity).then((url) => (img.value = url))

const spin = createGemSpin({
  draw: (y, x) => renderGemFrame(canvas.value, props.spec, y, x, props.clarity),
  canSpin: () => !!img.value,
  onCommit: async () => {
    live.value = true
    await nextTick()
  },
})
onBeforeUnmount(() => spin.destroy())
</script>

<template>
  <span @pointerdown="spin.down" @pointermove="spin.move" @pointerup="spin.up">
    <canvas v-if="live" ref="canvas" />
    <img v-else-if="img" :src="img" alt="" draggable="false" />
  </span>
</template>
```

Server-rendered? `GemView` and the renderer need `document`/`window` — mount
them client-side only.

## How it renders

1. **Geometry** — each cut family is built ring by ring from faceting diagrams
   (`cuts.js`): table → star facets → bezels → upper girdle facets → girdle band
   → pavilion mains → lower girdle facets → culet (a small flat facet, as on a
   real stone). Silhouettes ride on top of the same facet rings: `poly` for
   square/hexagonal outlines, `marquise`/`pear` grow √|sin θ| cusps into points,
   `heart` maps the girdle through the classic heart curve, and the cabochon is
   a lathe. Per-facet glint tints give every cut its scintillation.
2. **Materials** — a `ShaderMaterial` solves the light path per pixel against the
   stone's convex-hull facet planes (uploaded as uniforms), with optics from the
   spec; every software-WebGL run (like headless capture) and `tracer: false`
   keep `MeshPhysicalMaterial` with the same colour and a fire light inside the
   stone.
3. **The studio** — a procedural HDR environment (a dark room, an overhead
   softbox, two coloured strips, three pin-sharp points that flash as facets
   sweep past them) plus a small rig of directional lights. No `.hdr` download.
4. **The frame** — before a cut is ever shown, the renderer searches for the
   crop that holds the stone through _every pose a drag can reach_, and calibrates
   it so the resting stone's height is `scale.baseHeight` of the frame width.
   Static images and live canvases of the same cut share that rect, so the swap
   is seamless and a spinning stone is never clipped.

## Development

```bash
npm install
npm run dev           # the demo, with hot reload
npm run build         # → demo/dist (what GitHub Pages serves)
npm run build:selftest # also builds the browser smoke test (demo/selftest.html)
npm run format        # prettier
```

`demo/selftest.html` mounts two stones, re-bakes them through a `configure()`
call, spins one, updates the other's clarity and tears both down, reporting the
result into its page `<title>` — handy as a one-glance regression check after
touching the renderer.

The library is plain ESM source — no build step of its own (`three` ships the
same way), and `exports` maps `.`, `./presets`, `./spec`, `./spin` and `./view`.

### Publishing to GitHub Pages

Repo **Settings → Pages → Source: GitHub Actions**, then push to `main`:
`.github/workflows/pages.yml` builds the demo and deploys `demo/dist`. Asset
URLs are relative, so it works under any repo subpath.

## Credits

**The light tracer is a derivative work of
[ehsanwwe/diamond-shader-lab](https://github.com/ehsanwwe/diamond-shader-lab)**
by Ehsan Moradi (MIT). It was the starting point, and it is still the shape of
the thing: the facet-plane extraction, the ray/hull intersection, the Schlick
approximation, the internal bounce loop, the per-channel dispersion split and
the monochrome environment lookup all come from it — in places line for line.
On top of that base this library adds Beer–Lambert absorption along the light
path, specs' optical constants, a procedural HDR studio (no `.hdr` download),
the clarity blend and sRGB output, and the faceting cuts.
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) lists the derivation
function by function and reproduces the upstream licence.

Cut geometry follows the faceting diagrams at
[facetdiagrams.net](http://www.facetdiagrams.net).

## License

MIT — see [LICENSE](LICENSE). gemrenderer's own licence covers the code this
package adds; the derived tracer carries Ehsan Moradi's MIT notice as
required, in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
