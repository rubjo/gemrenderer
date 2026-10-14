// ── The cut roster ──
// One *distinct* faceting per gemstone, hand-built as three.js buffer
// geometry (in the spirit of the diagrams at facetdiagrams.net): four
// brilliants sharing a facet ring but wearing different silhouettes, three
// step cuts, a trilliant and a domed cabochon. Every builder takes the three
// namespace as its first argument, so nothing here pulls three.js into the
// bundle until a stone actually renders.

import { geomSig } from './spec.js'

// ── Heart silhouette lookup table ──
// The classic heart curve x = 16·sin³t, y = 13·cos t − 5·cos 2t − 2·cos 3t −
// cos 4t, rotated so the tip points at −x, sampled and inverted to r(θ). The
// curve is star-shaped around the origin, so every ray from the centre leaves
// through the outline exactly once and the polar map is single-valued — it can
// drive the same r(θ) girdle warp as the other brilliant silhouettes.
function heartRadiusLut(n = 256) {
  const lut = new Float32Array(n)
  const seen = new Uint8Array(n)
  const TAU = Math.PI * 2
  const H = 2048 // curve samples — dense against n buckets, tip included
  let maxR = 0
  for (let i = 0; i < H; i++) {
    const t = (i / H) * TAU
    const s = Math.sin(t)
    const hy =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t)
    const hx = 16 * s * s * s
    const x = hy / 17 // tip sits at hy = −17 → x = −1; cleft toward +x
    const z = hx / 17
    const r = Math.hypot(x, z)
    if (r <= 0) continue
    if (r > maxR) maxR = r
    const b = Math.floor(((((Math.atan2(z, x) / TAU) % 1) + 1) % 1) * n)
    seen[b] = 1
    if (r > lut[b]) lut[b] = r // outermost sample wins (single crossing anyway)
  }
  // Backfill empty buckets (sparse near the tip, where θ races per sample)
  // with the mean of the nearest filled circular neighbours.
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue
    let p = -1
    for (let d = 1; d < n; d++) {
      const j = (i - d + n) % n
      if (seen[j]) {
        p = j
        break
      }
    }
    let q = -1
    for (let d = 1; d < n; d++) {
      const j = (i + d) % n
      if (seen[j]) {
        q = j
        break
      }
    }
    lut[i] = (lut[p] + lut[q]) / 2
    seen[i] = 1
  }
  // Light wrap-around smoothing so bucket quantisation doesn't ridge the
  // lobes, then normalise the tip radius to 1.
  for (let pass = 0; pass < 2; pass++) {
    const src = Array.from(lut)
    for (let i = 0; i < n; i++)
      lut[i] =
        0.25 * src[(i - 1 + n) % n] + 0.5 * src[i] + 0.25 * src[(i + 1) % n]
  }
  for (let i = 0; i < n; i++) lut[i] /= maxR
  return lut
}

// Linear wrap-around lookup of the r(θ) tables above.
function lutRadius(lut, th) {
  const n = lut.length
  const f = ((((th / (Math.PI * 2)) % 1) + 1) % 1) * n
  const i = Math.floor(f) % n
  const j = (i + 1) % n
  return lut[i] + (lut[j] - lut[i]) * (f - Math.floor(f))
}

// ── Round brilliant geometry ──
// Eight-fold symmetry, built ring by ring (radii as fractions of girdle R=1):
//   table octagon (r .55) → star facets → octagonal bezel kites reaching the
//   girdle at 22.5°+45k → upper girdle triangles → thin girdle band →
//   pavilion mains (kites to the culet through the lower-junction ring r .55)
//   → lower girdle triangles → sub-culet facets.
function brilliantGeometry(THREE, spec = {}) {
  const rad = (d) => (d * Math.PI) / 180
  const rt = 0.55 // table radius
  // Crown height and pavilion depth are per-cut knobs: the silhouettes all
  // share the same facet rings, so their *profiles* are what tell them apart
  // in the resting side-on view — deep for the classic brilliant, shallower
  // for the elongated fancies.
  const hc = spec.hc ?? 0.34 // crown height
  const hu = hc * 0.44 // star-tip (upper junction) height (rides the crown)
  const ru = 0.8 // star-tip radius
  const gb = 0.06 // girdle band thickness
  const pd = spec.pd ?? 0.95 // pavilion depth (to culet)
  const lr = 0.55 // lower junction radius
  const ly = -(gb + pd * 0.45) // lower junction height

  const V = (r, y, deg) => [r * Math.cos(rad(deg)), y, r * Math.sin(rad(deg))]
  // Pear and heart put their point on the −x/+x axis: shift the ring phase by
  // −22.5° so a girdle vertex *lands on* θ=0 and θ=π — the tips must be real
  // vertices, or the outline chords across them and the point reads as blunt.
  // (Rigid rotation of the whole stone before the warp; other cuts unaffected.)
  const a0 = spec.pear || spec.heart ? -22.5 : 0
  const T = [] // table corners   @ 22.5+45k
  const U = [] // star tips       @ 45k
  const G = [] // girdle top      @ 22.5+45k
  const Gb = [] // girdle bottom  @ 22.5+45k
  const L = [] // lower junctions @ 45k
  for (let k = 0; k < 8; k++) {
    T.push(V(rt, hc, 22.5 + 45 * k + a0))
    U.push(V(ru, hu, 45 * k + a0))
    G.push(V(1, 0, 22.5 + 45 * k + a0))
    Gb.push(V(1, -gb, 22.5 + 45 * k + a0))
    L.push(V(lr, ly, 45 * k + a0))
  }
  const O = [0, hc, 0] // table centre

  // The culet is a tiny *flat facet* (as on a real brilliant, where the
  // polisher's stop leaves a small facet), not a needle point: a small ring
  // at the bottom plane, capped flat. Reads as a truncated pavilion and
  // keeps every brilliant-family cut off a sharp spike in profile.
  const CU = [] // culet facet corners @ 45k
  for (let k = 0; k < 8; k++) CU.push(V(0.1, -(gb + pd), 45 * k + a0))
  const CC = [0, -(gb + pd), 0] // culet facet centre

  const tris = []
  const kinds = [] // 'crown' | 'band' | 'pav' — drives per-facet glint tints
  const tri = (a, b, c, kind) => {
    tris.push(a, b, c)
    kinds.push(kind)
  }
  const nx = (i) => (i + 1) % 8

  for (let k = 0; k < 8; k++) {
    tri(O, T[nx(k)], T[k], 'crown') // table (fanned octagon)
    tri(T[k], T[nx(k)], U[nx(k)], 'crown') // star
    tri(T[k], U[k], G[k], 'crown') // bezel kite, left half
    tri(T[k], G[k], U[nx(k)], 'crown') // bezel kite, right half
    tri(G[k], U[nx(k)], G[nx(k)], 'crown') // upper girdle facet
    tri(G[k], G[nx(k)], Gb[nx(k)], 'band') // girdle band, tri 1
    tri(G[k], Gb[nx(k)], Gb[k], 'band') // girdle band, tri 2
    tri(Gb[k], L[k], CU[k], 'pav') // pavilion main, left half
    tri(Gb[k], CU[k], L[nx(k)], 'pav') // pavilion main, right half
    tri(Gb[k], L[nx(k)], Gb[nx(k)], 'pav') // lower girdle facet
    tri(L[k], L[nx(k)], CU[nx(k)], 'pav') // sub-culet facet, upper
    tri(L[k], CU[nx(k)], CU[k], 'pav') // sub-culet facet, lower
    tri(CC, CU[k], CU[nx(k)], 'pav') // flat culet facet
  }

  const g = new THREE.BufferGeometry()
  const pos = tris.flat()
  // Girdle-outline warp: `poly` maps the circle onto a regular n-gon with a
  // vertex on +x (4 = square brilliant, 6 = hexagon), `sx`/`sz` stretch it
  // into an oval, `marquise` grows pointed tips at ±x, `pear` grows a single
  // teardrop tip at −x, and `heart` maps the outline through the heart-curve
  // r(θ) table. Table and culet ride along (they sit at r=0 or on the rings),
  // so the whole stone takes the cut's silhouette.
  const { poly, sx = 1, sz = 1, marquise, pear, heart } = spec
  const hLut = heart ? heartRadiusLut() : null
  if (poly || sx !== 1 || sz !== 1 || marquise || pear || hLut) {
    const seg = poly ? (Math.PI * 2) / poly : 0
    const half = seg / 2
    for (let i = 0; i < pos.length; i += 3) {
      let x = pos[i]
      let z = pos[i + 2]
      if (x !== 0 || z !== 0) {
        const th = Math.atan2(z, x)
        let r = Math.hypot(x, z)
        if (marquise)
          // Pointed tips at ±x: the √|sinθ| cusp at the tips makes the ends
          // come to points, while the flanks stay convex like an oval.
          r *= 1 + marquise * (1 - Math.sqrt(Math.abs(Math.sin(th))))
        if (poly) {
          // Regular polygon with circumradius 1 and a vertex on +x: straight
          // edges, pinching to the inradius cos(π/n) at each edge's midpoint
          // (|δ−half| is the angle from the nearest vertex).
          const d = Math.abs((((th % seg) + seg) % seg) - half)
          r *= Math.cos(half) / Math.cos(d)
        }
        if (pear && Math.cos(th) < 0)
          // Teardrop: the √|sinθ| cusp grows a point at −x (the a0 phase puts
          // a vertex right on the tip), while the +x side stays the round
          // lobe — the factor is exactly 1 where cos θ ≥ 0, so the join is
          // continuous.
          r *= 1 + pear * (1 - Math.sqrt(Math.abs(Math.sin(th))))
        if (hLut) r *= lutRadius(hLut, th)
        x = r * Math.cos(th) * sx
        z = r * Math.sin(th) * sz
      }
      pos[i] = x
      pos[i + 2] = z
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  applyGlints(THREE, g, tris.length, kinds)
  return g
}

// Per-facet glint tint: deterministic pseudo-random brightness spread per
// facet — the alternating bright/dark scintillation of a cut stone. Kept
// mostly at-or-below the body colour: facets above ~1.0 wash the stone
// toward white and make it read milky.
function applyGlints(THREE, g, nTris, kinds, spread = null) {
  const KIND_BASE = { crown: 0.95, band: 0.95, pav: 0.7 }
  // lo/hi multiplier range over the base colour; cuts with few, large facets
  // pass a narrower band, or their dark draws read as dead black patches.
  const [lo, hi] = spread || [0.42, 0.72]
  const colors = new Float32Array(nTris * 3) // 1 float rgb per vertex
  for (let i = 0; i < nTris; i++) {
    const r = Math.abs(Math.sin((i + 1) * 12.9898) * 43758.5453) % 1
    // Wide contrast per-facet spread — deep darks beside brights — is the
    // scintillation that reads as brilliance; a narrow band reads as flat
    // gray. Kept at-or-below ~1.1: facets above that wash the stone white.
    const v = KIND_BASE[kinds[i]] * (lo + hi * r)
    for (let j = 0; j < 3; j++) {
      const o = (i * 3 + j) * 3
      colors[o] = colors[o + 1] = colors[o + 2] = v
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

// ── Step-cut (emerald cut) geometry ──
// Concentric octagonal rings (a rectangle with clipped corners, long side
// along x) stepping down crown and pavilion to a pinched keel — the
// hall-of-mirrors terraces of a emerald cut, whose clipped corners exist to
// keep the brittle stone from chipping during cutting. The knobs reshape the
// family per member: the baguette rides one wide pavilion terrace, the
// asscher a small table, deep corner cuts, a tall crown and a steeper
// pavilion.
function emeraldGeometry(THREE, spec = {}) {
  const aspect = spec.aspect ?? 1.45
  const cutAmt = spec.cutAmt ?? 0.32
  const gb = 0.06
  const pd = spec.pd ?? 0.88 // pavilion depth
  const hc = spec.hc ?? 0.3 // crown height
  const hu = hc * 0.53 // upper crown step height
  const hx = 1
  const hz = 1 / aspect
  const oct = (s, y) => {
    const X = hx * s
    const Z = hz * s
    const k = Math.min(cutAmt, hz * 0.7) * s
    return [
      [X, y, Z - k],
      [X - k, y, Z],
      [-(X - k), y, Z],
      [-X, y, Z - k],
      [-X, y, -(Z - k)],
      [-(X - k), y, -Z],
      [X - k, y, -Z],
      [X, y, -(Z - k)],
    ]
  }
  const R = [
    oct(spec.table ?? 0.52, hc), // table
    oct(0.78, hu), // upper crown step
    oct(1, 0), // girdle top
    oct(1, -gb), // girdle bottom
  ]
  const pavSteps = spec.pavSteps ?? 2
  for (let i = 1; i <= pavSteps; i++) {
    // Intermediate pavilion terraces, eased toward the keel: at pavSteps=2
    // this reproduces the classic .72/.46 ring pair at depths .45/.7.
    const f = i / (pavSteps + 1)
    R.push(oct(1 - 0.82 * f, -(gb + pd * (0.2 + 0.75 * f))))
  }
  // The keel: a pinch to a *line* along x, closed flat — step cuts end on a
  // razor edge, never the conical culet of a brilliant. Readable from the
  // side as a flat bottom beside the pointy cuts.
  R.push(oct(0.18, -(gb + pd)).map(([x, y, z]) => [x, y, z * 0.16]))
  const tris = []
  const kinds = []
  const tri = (a, b, c, kind) => {
    tris.push(a, b, c)
    kinds.push(kind)
  }
  // Table fan (winding mirrors the brilliant's).
  const O = [0, hc, 0]
  for (let i = 0; i < 8; i++) tri(O, R[0][(i + 1) % 8], R[0][i], 'crown')
  // Ring strips: upper ring → lower ring.
  const strip = (a, b, kind) => {
    for (let i = 0; i < 8; i++) {
      tri(a[i], a[(i + 1) % 8], b[(i + 1) % 8], kind)
      tri(a[i], b[(i + 1) % 8], b[i], kind)
    }
  }
  strip(R[0], R[1], 'crown')
  strip(R[1], R[2], 'crown')
  strip(R[2], R[3], 'band')
  for (let i = 3; i < R.length - 1; i++) strip(R[i], R[i + 1], 'pav')
  // Close under the keel flat: the fan centre sits *on* the keel plane, so
  // the stone stands on its razor line, not on a tip.
  const B = [0, -(gb + pd), 0]
  for (let i = 0; i < 8; i++)
    tri(R[R.length - 1][i], R[R.length - 1][(i + 1) % 8], B, 'pav')

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3))
  g.computeVertexNormals()
  applyGlints(THREE, g, tris.length, kinds)
  return g
}

// ── Trilliant (triangular brilliant) geometry ──
// Three-fold rings: an alternating corner/edge-midpoint hexagon, star-and-
// bezel crown, and mains running to a culet — the cut chosen for benitoite's
// higher dispersion, here maximising glint instead of table clarity.
function trilliantGeometry(THREE, spec = {}) {
  const rad = (d) => (d * Math.PI) / 180
  const gb = 0.06
  const pd = spec.pd ?? 0.92 // pavilion depth
  const hc = spec.hc ?? 0.3 // crown height
  const hu = hc * 0.47 // star-tip height
  const V = (r, y, deg) => [r * Math.cos(rad(deg)), y, r * Math.sin(rad(deg))]
  // Six ring points: corners at 90+120k, edge midpoints at 150+120k with
  // r = cos 60 = .5 (the triangle's edges).
  const ring = (s, y) => {
    const p = []
    for (let k = 0; k < 3; k++) {
      p.push(V(s, y, 90 + 120 * k))
      p.push(V(0.5 * s, y, 150 + 120 * k))
    }
    return p
  }
  const R = [
    ring(0.52, hc), // table
    ring(0.8, hu), // star tips
    ring(1, 0), // girdle top
    ring(1, -gb), // girdle bottom
    ring(0.55, -(gb + pd * 0.5)), // lower junctions
  ]
  // The trilliant keeps its single-point culet: the triangle's pointed tip
  // is its identity, and its fan topology (built to one shared point) is
  // watertight — a culet ring would open gaps in the fan.
  const C = [0, -(gb + pd), 0] // culet
  const tris = []
  const kinds = []
  const tri = (a, b, c, kind) => {
    tris.push(a, b, c)
    kinds.push(kind)
  }
  const n6 = (i) => (i + 1) % 6
  const O = [0, hc, 0]
  for (let i = 0; i < 6; i++) {
    tri(O, R[0][n6(i)], R[0][i], 'crown') // table fan
    tri(R[0][i], R[0][n6(i)], R[1][n6(i)], 'crown')
    tri(R[0][i], R[1][n6(i)], R[1][i], 'crown') // crown kite halves
    tri(R[1][i], R[1][n6(i)], R[2][n6(i)], 'crown')
    tri(R[1][i], R[2][n6(i)], R[2][i], 'crown') // bezels
    tri(R[2][i], R[2][n6(i)], R[3][n6(i)], 'band')
    tri(R[2][i], R[3][n6(i)], R[3][i], 'band') // girdle band
    // Pavilion: a proper closed skirt between the girdle and junction
    // rings, then the sub-culet fan to the point. (The original fanned two
    // triangles straight from the girdle ring to the culet and left the
    // skirt open — six wedge holes through the stone, invisible under the
    // milky material but glaring through the tracer.)
    tri(R[3][i], R[3][n6(i)], R[4][n6(i)], 'pav')
    tri(R[3][i], R[4][n6(i)], R[4][i], 'pav') // pavilion band
    tri(R[4][i], R[4][n6(i)], C, 'pav') // sub-culet fan
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3))
  g.computeVertexNormals()
  applyGlints(THREE, g, tris.length, kinds)
  return g
}

// ── Cabochon geometry ──
// The one unfaceted cut: a flat back, a plain rim at the girdle and a smooth
// elliptical dome. Profiled as a surface of revolution; the shared material's
// flat shading turns the dome's tessellation into fine spherical facets that
// scintillate as the stone turns. Paraíba tourmaline is classically cut this
// way, and the round dome silhouette is unlike every faceted stone beside it.
function cabochonGeometry(THREE) {
  const seg = 26 // lathes around the axis — coarse enough to facet visibly
  const rim = 0.92 // rim radius at the girdle
  const flat = 0.2 // flat-back depth below the girdle
  const dome = 0.68 // dome height above the girdle
  const profile = [
    new THREE.Vector2(0, -flat), // back centre
    new THREE.Vector2(rim * 0.92, -flat), // flat back
    new THREE.Vector2(rim, -flat * 0.3), // rim bevel
    new THREE.Vector2(rim, 0), // girdle
  ]
  const rings = 7
  for (let i = 1; i <= rings; i++) {
    const a = (i / rings) * (Math.PI / 2)
    profile.push(new THREE.Vector2(rim * Math.cos(a), dome * Math.sin(a)))
  }
  const g = new THREE.LatheGeometry(profile, seg).toNonIndexed()
  const pos = g.getAttribute('position')
  const nTri = pos.count / 3
  const kinds = new Array(nTri)
  for (let i = 0; i < nTri; i++) {
    const cy = (pos.getY(i * 3) + pos.getY(i * 3 + 1) + pos.getY(i * 3 + 2)) / 3
    kinds[i] = cy > -flat * 0.5 ? 'crown' : 'pav' // back sits darker
  }
  g.computeVertexNormals()
  // The dome's facets are large — with the standard wide glint spread their
  // dark draws read as dead black patches, so the stone gets a brighter,
  // narrower band: a glossy, scintillating dome instead. nTris is the vertex
  // count (applyGlints sizes the buffer 3 floats per vertex and paints
  // per-facet runs — same call convention as every other cut).
  applyGlints(THREE, g, pos.count, kinds, [0.68, 0.4])
  return g
}

// ── The cut families ──
// Four generic geometry builders, each a *family* of silhouettes driven by its
// own params (see each builder for the knobs):
//   brilliant  the faceted brilliant — round by default, and square (`poly`),
//              elongated (`sx`/`sz`), pointed (`marquise`), teardrop (`pear`)
//              or heart (`heart`) as the silhouette knobs ask.
//   step       the step cut — emerald/asscher/baguette by `aspect`, `cutAmt`,
//              `table`, `pavSteps`.
//   trilliant  the triangular brilliant.
//   cabochon   the domed, unfaceted lathe.
// A caller names the family and passes its knobs as `cut`; nothing here knows
// which real gemstone wears which cut (that mapping lives in the presets).
const FAMILIES = {
  brilliant: brilliantGeometry,
  step: emeraldGeometry,
  trilliant: trilliantGeometry,
  cabochon: cabochonGeometry,
}

export const CUT_FAMILIES = Object.keys(FAMILIES)

const geoms = new Map() // cut signature -> BufferGeometry (colour/clarity-blind)

// Build (or reuse) the geometry for a cut spec — `{ family, ...params }`. The
// whole cut object is the params the builder reads, so it's handed straight
// through (an unknown `family` falls back to the brilliant).
export function getGeometry(THREE, cut) {
  const sig = geomSig({ cut })
  if (!geoms.has(sig)) {
    const make = FAMILIES[cut?.family] || FAMILIES.brilliant
    geoms.set(sig, make(THREE, cut || {}))
  }
  return geoms.get(sig)
}
