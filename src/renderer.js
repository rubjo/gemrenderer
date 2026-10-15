// Renders a gemstone *spec* with three.js — a body colour, one of the cut
// families (round/square/pear/heart/marquise brilliant, three step cuts, a
// trilliant, a cabochon), real optical constants — and turns it into a
// transparent PNG per spec + sheen clarity. Nothing here knows the name of any
// real gemstone; the ten the library ships live in `gemrenderer/presets`.
//
// The heavy lifting happens once per spec+clarity: a single shared, hidden
// WebGL context renders each stone and caches its data URL — so a page full
// of gems never exhausts the browser's WebGL context limit. Callers that only
// show stones as images never touch a canvas at all; `renderGemFrame()` hands
// the same fitted frame to a canvas the caller owns for live spinning.
//
// This module is DOM-light but not headless-safe: it needs `document` and
// `window` (the render targets and the alpha-scan scratch canvas).

import { resolveSpec, resolveClarity, frameSig, gemSig } from './spec.js'
import { getGeometry } from './cuts.js'
import { config, configure, onConfigChange } from './options.js'
import { makeTracerMaterial, loadTracerHull } from './tracer.js'

const cache = new Map() // `gemSig:clarity` -> Promise<dataURL|null>

// Escape hatch for the traced materials: flips every traced cut back to the
// classic MeshPhysicalMaterial so the two looks can be compared (software-
// rendered capture runs are the automatic version of it).
export function setTracerEnabled(on) {
  configure({ tracer: !!on })
}

// Sheen grows with the clarity (0 … 9): brighter environment, sharper facets,
// stronger iridescent fire and inner glow.
function sheenFor(clarity) {
  const t = Math.min(9, Math.max(0, clarity))
  return {
    roughness: 0.05 - 0.004 * t,
    // The room env is white — restraint, or its reflections lay a gray
    // veil over the body colour. Fire and scintillation carry the sparkle.
    envMapIntensity: 1.3 + 0.122 * t,
    iridescence: 0.12 + 0.028 * t,
    fire: 11 + 2.2 * t,
  }
}

let ctx = null // { THREE, renderer, scene, camera, env }

async function ensureContext() {
  if (ctx) return ctx
  const THREE = await import('three')
  const { RoomEnvironment } =
    await import('three/examples/jsm/environments/RoomEnvironment.js')
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  })
  renderer.setSize(config.resolution, config.resolution, false)
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  // Headless promo capture forces software WebGL (SwiftShader) — the
  // per-pixel hull tracer would bake each stone in seconds there, so those
  // runs keep the MeshPhysicalMaterial path.
  const gl = renderer.getContext()
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  const gpuName = dbg
    ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
    : ''
  const software = /swiftshader|llvmpipe|basic render|software/i.test(gpuName)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.02).texture
  // The room env is bright and white — barely a touch of it, or the stone
  // turns milky and the pavilion glows like fog.
  scene.environmentIntensity = 0.18
  pmrem.dispose()

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20)
  // Far enough back that the whole stone fits inside the frame at *every*
  // spin/tilt angle a drag allows — the shared frame rect (below) is only
  // guaranteed uncropped while the stone never touches the canvas edge. The
  // low pitch keeps the resting pose side-on: the classic gem profile with
  // the pavilion tip below the girdle.
  camera.position.set(0, 0.62, 5.5)
  camera.lookAt(0, -0.34, 0)

  const key = new THREE.DirectionalLight(0xffffff, 2.6)
  key.position.set(2.4, 3.6, 2.2)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0xd8e8ff, 1.1)
  rim.position.set(-2.6, 1.4, -2.0)
  scene.add(rim)
  // Sky-from-above, dark sea below: gives the crown a cool bounce without
  // making the pavilion glow.
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x16233a, 0.6))
  // Front-low key so the pavilion's mains catch light and the stone reads
  // as glass, not plastic.
  const pavKey = new THREE.DirectionalLight(0xbfd9ff, 0.5)
  pavKey.position.set(0.6, -1.4, 2.8)
  scene.add(pavKey)
  const fill = new THREE.DirectionalLight(0xffffff, 0.25)
  fill.position.set(0, -2.4, 1.6)
  scene.add(fill)

  ctx = {
    THREE,
    renderer,
    scene,
    camera,
    software,
    // The frame search only ever reads the stone's alpha silhouette, so it
    // renders through this trivial opaque material instead of the tracer: the
    // fitted frame depends on geometry and pose alone, and the per-pixel light
    // path would otherwise be traced dozens of times per cut and thrown away.
    silhouette: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    _v3: new THREE.Vector3(),
    _inv: new THREE.Matrix4(),
    _m3: new THREE.Matrix3(),
    _qa: new THREE.Quaternion(),
    _qb: new THREE.Quaternion(),
    _qc: new THREE.Quaternion(),
    _up: new THREE.Vector3(0, 1, 0),
    _ux: new THREE.Vector3(1, 0, 0),
  }
  return ctx
}

// One stone per spec+clarity, kept alive and swapped in and out of the shared
// scene: static PNGs and drag-to-spin canvases all reuse the same meshes,
// so the whole page uses exactly one WebGL context.

// Composed in three explicit steps rather than one Euler triple:
//
//   world = Ry(spin) · Rx(tilt + lean) · Ry(rest yaw) · stone
//
//   • inner yaw aims the cut's icon axis (pear/heart tips build on mesh −x,
//     so e.g. a quarter turn hangs them screen-down);
//   • the lean lays the stone back about the screen's horizontal axis;
//   • a drag's spin is the OUTERMOST rotation, about the screen's
//     vertical axis — so a horizontal drag turntables every gem identically,
//     however far back its presentation tilt leans it. (Baking the spin
//     into the mesh's Euler yaw instead — Rx·Ry(yaw+spin) — spins a heavily
//     tilted heart about its own laid-back upright axis, which tumbles
//     wildly instead of turning it around.)
//
// The resting lean/yaw come from the spec (restTilt / restYaw); a drag's tilt
// rides the same screen-x axis at every spin angle. Rest pose is (0, 0).
function poseStone(c, mesh, spec, rotX = 0, rotY = 0) {
  const { _qa, _qb, _qc, _up, _ux } = c
  _qa.setFromAxisAngle(_up, spec.restYaw)
  _qb.setFromAxisAngle(_ux, spec.restTilt + rotX)
  _qc.setFromAxisAngle(_up, rotY)
  mesh.quaternion.copy(_qc).multiply(_qb).multiply(_qa)
}
// Resting-stone height as a fraction of the mount's box width — the knob
// `configure({ scale: { baseHeight } })` writes. Every cut is calibrated so
// its resting silhouette is this fraction of the fitted frame's width, which
// is what lets a caller size the *stone* by sizing its box.
export function heightRatio() {
  return config.scale.baseHeight
}
const stones = new Map() // `gemSig:clarity` -> { mesh, fire }
let mounted = null // stone key currently in the scene

async function getStone(c, spec, clarity) {
  const key = `${gemSig(spec)}:${clarity}`
  if (!stones.has(key)) {
    const THREE = c.THREE
    const sheen = sheenFor(clarity)
    // Per-stone brilliance multiplier: more environment sparkle and stronger
    // internal fire, on top of the body colour (a diamond runs ~1.4).
    const bright = spec.bright ?? 1
    const geo = getGeometry(THREE, spec.cut)
    // Every spec traces its own hull by default; only the config toggle and a
    // software renderer fall back to the faked-scintillation physical material.
    const traced = config.tracer && !c.software
    let mat
    if (traced) {
      mat = makeTracerMaterial(THREE, {
        clarity,
        colorHex: spec.color,
        ior: spec.ior,
        fire: spec.fire,
        bright,
      })
      await loadTracerHull(THREE, mat, geo)
    } else {
      mat = new THREE.MeshPhysicalMaterial({
        color: spec.color,
        vertexColors: true, // per-facet glint tints from the geometry
        metalness: 0.0,
        roughness: sheen.roughness,
        envMapIntensity: sheen.envMapIntensity * bright,
        ior: spec.ior,
        reflectivity: 1,
        transparent: true,
        // See-through glass — but backed by strong internal light (facet
        // scintillation + the fire light), not by transmission: with an empty
        // scene behind the stone, transmission can only refract the void, and
        // the void is gray. Don't reintroduce it. Kept fairly opaque: every
        // point of transparency mixes the page background into the body
        // colour and dulls it.
        opacity: 0.8,
        side: THREE.DoubleSide,
        flatShading: true,
        // Light clearcoat: glossy, but the white lacquer layer desaturates —
        // more than half was visibly washing the body colour out.
        clearcoat: 0.35,
        clearcoatRoughness: 0.04,
        iridescence: sheen.iridescence,
        iridescenceIOR: 1.55, // the warm/pink "fire" in reflections
      })
    }
    const mesh = new THREE.Mesh(geo, mat)
    poseStone(c, mesh, spec)
    // (quaternion composition — see poseStone)
    // Non-uniform scale: the side-on projection is inherently squat (~0.67×
    // as tall as wide), so the per-cut `stretch` (calibrated in
    // computeFrameRect) elongates the mesh along Y until the rendered
    // silhouette is heightRatio() of the frame's width when sized to that
    // width.
    const st0 = frames.get(frameSig(spec))
    const s = st0?.scale ?? 1.06
    mesh.scale.set(s, s * (st0?.stretch ?? 1), s)
    // One point light in the stone's own tinted glow, up front-left — the
    // coloured fire in the reference photos. Scaled by `bright` too, so a
    // bright stone's interior reads as light, not body colour.
    const fire = new THREE.PointLight(spec.glow, sheen.fire * bright, 8)
    fire.position.set(-1.6, 1.4, 1.8)
    stones.set(key, { mesh, fire })
  }
  return stones.get(key)
}

// Attaches one stone (and detaches whatever was mounted before).
async function mountStone(c, spec, clarity) {
  const key = `${gemSig(spec)}:${clarity}`
  if (mounted !== key) {
    if (mounted) {
      const prev = stones.get(mounted)
      c.scene.remove(prev.mesh, prev.fire)
    }
    const { mesh, fire } = await getStone(c, spec, clarity)
    c.scene.add(mesh, fire)
    mounted = key
  }
  return stones.get(key).mesh
}

// getStone became async (lazy ConvexHull import for the tracer materials),
// so mount/render/crop no longer runs back-to-back on its own — and callers
// bake their PNGs concurrently. Without a queue two mountStone calls inter-
// leave at the await, both re-add their stone, and the orphaned mesh rides
// every later frame (the classic "the gem changed when I started dragging",
// where the live canvas suddenly shows the wrong stone too). Every job that
// touches the shared scene therefore runs one at a time.
let jobQueue = Promise.resolve()
function enqueue(task) {
  const out = jobQueue.then(task, task)
  jobQueue = out.then(
    () => {},
    () => {},
  )
  return out
}

// Tracer materials trace the light path in the stone's local space, so the
// camera position must be expressed through the stone's current world
// transform (calibration scale included) and the world-fixed environment
// directions must rotate with it. No-op for the physical materials.
function syncStone(c, mesh) {
  const u = mesh.material.uniforms
  if (!u || !u.uLocalCam) return
  mesh.updateMatrixWorld()
  c._inv.copy(mesh.matrixWorld).invert()
  u.uLocalCam.value.copy(c.camera.position).applyMatrix4(c._inv)
  c._m3.setFromMatrix4(mesh.matrixWorld)
  // Strip the calibration scale from the rotation: normalise each column.
  const el = c._m3.elements
  for (let i = 0; i < 3; i++) {
    const a = el[i * 3]
    const b = el[i * 3 + 1]
    const d = el[i * 3 + 2]
    const len = Math.hypot(a, b, d) || 1
    el[i * 3] = a / len
    el[i * 3 + 1] = b / len
    el[i * 3 + 2] = d / len
  }
  u.uEnvRot.value.copy(c._m3)
}

// The stone is rendered into a square frame, then cropped to a fitted rect:
// the union of its alpha bounds over *every* pose a drag can take it into
// (a view spins and tumbles without limits now, so full rotations in
// both axes), plus a small margin. Each cut+pose has its own
// silhouette, so the fitted frame is calibrated per frame signature. Static
// PNGs and live canvases of the same cut carry the same rect, so the img→canvas
// swap is seamless and the spinning stone never gets cut off. The rect holds
// only the stone plus its rotation headroom, so CSS can size the *stone* (its
// height is pinned to the frame width via heightRatio()) without oversized
// transparent padding in the box.
const frames = new Map() // frameSig -> { rect, scale, stretch, ratio }
const restPads = new Map() // `gemSig:clarity` -> resting empty padding of the
// frame as fractions of the frame *width*: { top, bottom }. A view uses
// the bottom pad (plus half the height shortfall) to lift the stone's own
// bottom just above the bottom of its box.

let scratch = null // 2D canvas mirroring the WebGL frame for alpha scans
function alphaBounds(c) {
  const src = c.renderer.domElement
  const W = src.width
  const H = src.height
  if (!scratch) scratch = document.createElement('canvas')
  scratch.width = W
  scratch.height = H
  const g = scratch.getContext('2d', { willReadFrequently: true })
  g.drawImage(src, 0, 0)
  const d = g.getImageData(0, 0, W, H).data
  let x0 = W
  let y0 = H
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}

// Renders one pose for the frame search and returns its alpha bounds. The
// stone's real material is swapped out for the shared opaque silhouette one:
// the fit is a property of the geometry and the pose, so the tracer's optics
// contribute nothing — and tracing a full light path per pose, dozens of times
// per cut, is what made the first bake take seconds on mobile GPUs.
function renderSilhouette(c, mesh, spec, rotX = 0, rotY = 0) {
  const real = mesh.material
  mesh.material = c.silhouette
  try {
    poseStone(c, mesh, spec, rotX, rotY)
    c.renderer.render(c.scene, c.camera)
    return alphaBounds(c)
  } finally {
    mesh.material = real
  }
}

// Poses sampled for the union bounds, relative to the spec's rest tilt:
// every tumble extreme at a few spins. A drag is unbounded on both
// axes, so the frame must survive full upside-down inversions (rx ±π/2 is
// enough: beyond that the extents mirror). The round-ish cuts are *nearly*
// spin-invariant (8-fold symmetry), but the elongated and angular cuts
// (marquise, oval, square, hexagon) sweep a wider profile as they turn, and
// under tilt the vertical extent depends on how a facet ring's vertices
// align with the tilt axis — sampling spins keeps the margin honest, so
// nothing ever clips mid-drag.
const FRAME_POSES = []
for (const rx of [-Math.PI / 2, -0.6, 0, 0.6, Math.PI / 2]) {
  // Spins sampled every 0.4 rad: a spinning pear/heart's widest angle sits
  // at atan(length/width) ≈ 0.9–1.0 rad — well inside the sampling, so no
  // mid-drag yaw can outgrow the fitted frame.
  for (const ry of [0, 0.4, 0.8, 1.2]) FRAME_POSES.push([rx, ry])
}

// Frame-search render size. The fitted rect is a ratio-preserving fit, so a
// coarser frame changes nothing but the (sub-pixel at the final resolution)
// quantization of the crop — while cutting the per-pose framebuffer readback,
// the search's real cost, by (resolution / this)². Capped at the configured
// resolution so a small `configure({ resolution })` never searches larger.
const SEARCH_RES = 256

function computeFrameRect(c, mesh, spec) {
  const fk = frameSig(spec)
  // The fit is a pure geometry problem — it needs only the stone's silhouette
  // bounds, which scale with the frame — so the search runs at a reduced
  // resolution. The dominant cost is reading the framebuffer back once per
  // pose (dozens per cut), and that readback is proportional to the frame's
  // area; the rect is scaled back to the real frame on the way out.
  const full = config.resolution
  const search = Math.min(full, SEARCH_RES)
  const k = full / search
  if (search !== full) c.renderer.setSize(search, search, false)
  try {
    return fitFrameRect(c, mesh, spec, fk, search, search, k)
  } finally {
    if (search !== full) c.renderer.setSize(full, full, false)
  }
}

// The search proper, rendered into a `W`×`H` frame; `k` scales its fitted
// rect back up to the real render frame.
function fitFrameRect(c, mesh, spec, fk, W, H, k) {
  // Y-stretch exists only to *nudge* the resting silhouette toward
  // heightRatio(). Under the presentation tilt the table view dominates the
  // silhouette height, and stretching can't close the ratio (the height is
  // affine in the stretch, not proportional) — an unclamped multiplier
  // chase inflates the stone, distorts it visibly, and pushes the tumbling
  // bounds past any canvas-fitting scale. Clamped, so the fit converges and
  // stones stay proportional.
  const fitStretch = (v) => Math.min(1.5, Math.max(0.8, v))
  const prev = frames.get(fk)
  let scale = prev?.scale ?? 1.06
  let stretch = prev?.stretch ?? 1
  let calibrated = prev?.stretch != null
  let corrected = prev?.stretch != null
  for (let attempt = 0; attempt < 12; attempt++) {
    mesh.scale.set(scale, scale * stretch, scale)
    // Aspect calibration first (it changes the required fit, not the other
    // way round): the resting stone's visible height should equal
    // heightRatio() of the frame's width, since CSS sizes the img's *width*
    // to the mount's width — the extents then keep a fixed ratio and
    // the caller insets the stone just inside its box.
    // Only the rest pose is needed: the fit scale shrinks both extents
    // alike (the ratio is scale-invariant), and the stone's x-extent barely
    // moves between poses — the correction pass below handles the rest.
    if (!calibrated) {
      const rb = renderSilhouette(c, mesh, spec)
      let done = true
      if (rb && rb.x0 > 0 && rb.y0 > 0 && rb.x1 < W - 1 && rb.y1 < H - 1) {
        const restH = rb.y1 - rb.y0 + 1
        const mx = Math.max(3, (rb.x1 - rb.x0) * 0.025)
        const want = (rb.x1 - rb.x0 + 1 + 2 * mx) * heightRatio() // target height, as cropped below
        if (Math.abs(restH / want - 1) > 0.005 && attempt < 7) {
          const next = fitStretch(stretch * (want / restH))
          if (Math.abs(next - stretch) > 1e-3) {
            stretch = next
            done = false
          }
          // else: clamped — the ratio can't be closed by stretching; accept
        }
      } else if (rb) {
        // Rest silhouette clipped by the canvas edge: measurements would read
        // artificially short. Shrink proportionally to the overshoot before
        // calibrating against it (a fixed crawl needs more attempts than the
        // budget leaves).
        scale *=
          0.95 *
          Math.min(
            0.92,
            (W - 8) / (rb.x1 - rb.x0 + 1),
            (H - 8) / (rb.y1 - rb.y0 + 1),
          )
        continue
      }
      if (done) calibrated = true
      else continue
    }
    // Union bounds over every pose a drag can take the stone into.
    let u = null
    let restB = null
    for (const [rx, ry] of FRAME_POSES) {
      // The frame bounds true reachable poses — the same world-frame axes a
      // view drags on — but the silhouette material needs no optics sync.
      const b = renderSilhouette(c, mesh, spec, rx, ry)
      if (!b) continue
      if (rx === 0 && ry === 0) restB = b
      u = u
        ? {
            x0: Math.min(u.x0, b.x0),
            y0: Math.min(u.y0, b.y0),
            x1: Math.max(u.x1, b.x1),
            y1: Math.max(u.y1, b.y1),
          }
        : b
    }
    if (!u) break
    // A few px of margin keeps the drop-shadow's anchor facets intact.
    const mx = Math.max(4, (u.x1 - u.x0) * 0.035)
    const my = Math.max(4, (u.y1 - u.y0) * 0.035)
    // The stone must sit clear of the canvas edge at every pose before the
    // union bounds mean anything: a silhouette clipped by the edge reads
    // artificially wide, and sizing the height against that poisoned width
    // leaves the stone squat for good (wide-swinging cuts — the marquise's
    // tips — hit this first). Shrink proportionally to the overshoot — one
    // or two passes, not a crawl — then correct the height.
    if (!(u.x0 - mx > 0 && u.y0 - my > 0 && u.x1 + mx < W && u.y1 + my < H)) {
      scale *=
        0.95 *
        Math.min(
          0.92,
          (W - 2 * mx) / (u.x1 - u.x0 + 1),
          (H - 2 * my) / (u.y1 - u.y0 + 1),
        )
      continue
    }
    // One honest correction against the final crop width (the union's
    // x-extent is a hair wider than the rest's — nearer vertices project
    // wider — so the cheap rest-only calibration above undershoots ~1%).
    // Y stretch leaves the x-extent alone, and the next iteration verifies
    // the taller silhouette still fits before the frame is saved.
    if (!corrected && restB) {
      corrected = true
      const restH = restB.y1 - restB.y0 + 1
      const want = (u.x1 - u.x0 + 1 + 2 * mx) * heightRatio()
      if (Math.abs(restH / want - 1) > 0.005 && attempt < 7) {
        const next = fitStretch(stretch * (want / restH))
        if (Math.abs(next - stretch) > 1e-3) {
          stretch = next
          continue
        }
      }
    }
    mesh.scale.set(scale, scale * stretch, scale)
    poseStone(c, mesh, spec)
    const sx = Math.floor(u.x0 - mx)
    const sy = Math.floor(u.y0 - my)
    const sw = Math.ceil(u.x1 - sx + mx)
    const sh = Math.ceil(u.y1 - sy + my)
    // Resting silhouette height as a fraction of the cropped frame width:
    // the caller multiplies its display width by heightRatio()·boost / ratio
    // so every cut's stone lands on the same visual size (getGemSizing). The
    // ratio is resolution-invariant, so it's measured here in search space.
    const ratio = restB
      ? Math.min(1.4, Math.max(0.3, (restB.y1 - restB.y0 + 1) / sw))
      : heightRatio()
    // Scale the search-space rect back into the real render frame.
    const rect = {
      sx: Math.round(sx * k),
      sy: Math.round(sy * k),
      sw: Math.round(sw * k),
      sh: Math.round(sh * k),
    }
    frames.set(fk, { rect, scale, stretch, ratio })
    return rect
  }
  // Failed fit: cache the full-frame fallback so it runs *once*. A caller
  // that re-ran this per frame (the live drag) would pay the whole
  // attempt × pose search every rAF — the old drag-perf killer.
  const fb = { sx: 0, sy: 0, sw: W * k, sh: H * k }
  frames.set(fk, { rect: fb, scale, stretch, ratio: heightRatio() })
  return fb
}

function cropFrame(c, r) {
  const src = c.renderer.domElement
  const out = document.createElement('canvas')
  out.width = r.sw
  out.height = r.sh
  out.getContext('2d').drawImage(src, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh)
  return out.toDataURL('image/png')
}

function renderGem(spec, clarity) {
  return enqueue(async () => {
    const c = await ensureContext()
    const mesh = await mountStone(c, spec, clarity)
    const r =
      frames.get(frameSig(spec))?.rect || computeFrameRect(c, mesh, spec)
    poseStone(c, mesh, spec)
    syncStone(c, mesh)
    beginFrame(c)
    c.renderer.render(c.scene, c.camera)
    if (r) {
      // How far the resting stone's edges sit inside the (tilt-padded) frame
      // — see restPads.
      const b = alphaBounds(c)
      if (b)
        restPads.set(`${gemSig(spec)}:${clarity}`, {
          top: (b.y0 - r.sy) / r.sw,
          bottom: (r.sy + r.sh - 1 - b.y1) / r.sw,
        })
      return cropFrame(c, r)
    }
    return c.renderer.domElement.toDataURL('image/png')
  })
}

// The frame's empty padding at rest (fractions of the image's width; zeros
// before the first render / without WebGL).
export function getGemRestPad(spec, clarity = 2) {
  const s = resolveSpec(spec)
  return (
    restPads.get(`${gemSig(s)}:${resolveClarity(clarity)}`) ?? {
      top: 0,
      bottom: 0,
    }
  )
}

// Visual-size harmonisation. The fitted frame carries per-cut spin/tumble
// headroom, so an img pinned to the container width draws wide-sweeping
// cuts (the marquise) with a smaller stone than compact ones. getGemSizing
// answers, per spec: `target` — the resting stone's height as a fraction of
// the container width (uniform across cuts unless the spec's `sizeBoost` lifts
// a hero stone above the rest) — and `fit`, the factor to scale the image
// display width by so the stone actually lands on that height.
export function getGemSizing(spec) {
  const s = resolveSpec(spec)
  const target = heightRatio() * (s.sizeBoost ?? 1)
  const f = frames.get(frameSig(s))
  if (!f?.ratio) return { target, fit: 1, aspect: 1 }
  // aspect = frame width / height — the CSS `aspect-ratio` convention — so
  // a view can pin the display box from the first layout, instead of the
  // live canvas defaulting to its bare 300×150 box until the first frame
  // lands (which made the stone jump when a spin started).
  return { target, fit: target / f.ratio, aspect: f.rect.sw / f.rect.sh }
}

// Renders `spec`'s stone at spin angle `rotY` / tilt `rotX` into a 2D canvas
// the caller owns (drag-to-spin UIs), blitting
// the same shared frame rect the static PNG uses — the swap from image to
// live canvas is seamless. The blit is synchronous right after the render,
// so interleaved calls from several views never cross-pose. Sizes the
// canvas backing store to its displayed box (capped at the render frame).
export async function renderGemFrame(
  target,
  spec,
  rotY = 0,
  rotX = 0,
  clarity = 2,
) {
  const s = resolveSpec(spec)
  const t = resolveClarity(clarity)
  await enqueue(async () => {
    const c = await ensureContext()
    const mesh = await mountStone(c, s, t)
    const r = frames.get(frameSig(s))?.rect ||
      computeFrameRect(c, mesh, s) || {
        sx: 0,
        sy: 0,
        sw: c.renderer.domElement.width,
        sh: c.renderer.domElement.height,
      }
    poseStone(c, mesh, s, rotX, rotY)
    syncStone(c, mesh)
    beginFrame(c)
    c.renderer.render(c.scene, c.camera)
    const src = c.renderer.domElement
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(
      96,
      Math.min(
        config.resolution,
        Math.round((target.clientWidth || 300) * dpr),
      ),
    )
    const h = Math.round((w * r.sh) / r.sw)
    if (target.width !== w || target.height !== h) {
      target.width = w
      target.height = h
    }
    const g2d = target.getContext('2d')
    // `copy`, not source-over: the frame's transparent pixels must *erase*
    // the previous pose, or mid-drag the canvas accumulates ghost images of
    // every pose the stone passed through. (A resize clears it implicitly,
    // but the size rarely changes mid-drag.)
    g2d.globalCompositeOperation = 'copy'
    g2d.drawImage(src, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h)
    g2d.globalCompositeOperation = 'source-over'
  })
}

// Returns a Promise of a data URL, or null if rendering is impossible
// (no WebGL / older browser) — the caller keeps its own placeholder.
export function getGemImage(spec, clarity = 2) {
  const s = resolveSpec(spec)
  const t = resolveClarity(clarity)
  const key = `${gemSig(s)}:${t}`
  if (!cache.has(key)) {
    cache.set(
      key,
      renderGem(s, t).catch(() => {
        cache.delete(key) // let a later mount retry
        return null
      }),
    )
  }
  return cache.get(key)
}

// Live knobs that need no re-bake ride the shared scene: applied right before
// every draw, so a running page can dim or brighten stones instantly without
// dropping any cached frame.
function beginFrame(c) {
  c.renderer.toneMappingExposure = config.exposure
  c.scene.environmentIntensity = config.environment
}

// Drops every baked stone so the next render picks up new knobs. Materials go
// with it — each `configure()` would otherwise leak a compiled shader — while
// the config-independent geometries stay cached.
//
// The fitted frame survives most knob changes (alpha bounds don't move when
// only the shading changes), and recalibrating it is the expensive part: a
// frame re-fit still costs up to 12 attempts × 20 poses of alpha scans, though
// both the silhouette material and the reduced search resolution (SEARCH_RES)
// keep those scans cheap. It only goes stale when the stone's *shape on the
// canvas* changes — the height ratio or the render resolution — so
// `frames: false` keeps it.
export function invalidate({ frames: dropFrames = true } = {}) {
  cache.clear()
  restPads.clear()
  if (dropFrames) frames.clear()
  // Queue behind any in-flight bake before rewiring the shared scene.
  enqueue(() => {
    for (const { mesh, fire } of stones.values()) {
      if (ctx) ctx.scene.remove(mesh, fire)
      mesh.material?.dispose?.()
      fire.dispose?.()
    }
    stones.clear()
    mounted = null
    if (ctx) ctx.renderer.setSize(config.resolution, config.resolution, false)
  })
}

// Only these two knobs invalidate a fitted frame.
let fitShape = {
  baseHeight: config.scale.baseHeight,
  resolution: config.resolution,
}

onConfigChange(() => {
  const reshaped =
    fitShape.baseHeight !== config.scale.baseHeight ||
    fitShape.resolution !== config.resolution
  fitShape = {
    baseHeight: config.scale.baseHeight,
    resolution: config.resolution,
  }
  invalidate({ frames: reshaped })
})
