# Glint — an optional bloom pass for the ray-traced stone

A design note for the `glint` config knob. It documents _why_ the pass exists,
_what_ it does, and the constraints that shaped it, so the next person to touch
it doesn't have to re-derive them.

## Problem

The tracer already produces HDR light: `traceStoneHDR` returns linear values
well above 1 at the facet mirrors that sweep across the environment's hot
pin-points, and the fragment tail adds those glints back on top of a Reinhard-
mapped base (`col * smoothstep(1., 4., l) * uHighlight`). But it then clamps to
1 and sRGB-encodes _in the shader_ — a display-referred LDR image. A bright
facet mirror and a merely bright facet both land at white, so the stone's
scintillation reads as hard-edged, not as the soft flare a real stone throws
around a hot highlight.

Bloom is the missing half: let the >1 light bleed into its neighbours, then
tone-map. That is what makes a diamond's sparks read as _bright_ rather than as
_clipped_.

## Design

### Option surface

`configure({ glint })`, a single number, default `0`:

- `0` — off. The tracer's in-shader clamp + sRGB encode runs exactly as before;
  no render targets, no extra passes, no perf cost. This is the default.
- `> 0` — strength of the bloom added back over the stone. The knob runs
  `0`–`1`: a good range is ~`0.2`–`1.0`, with `1.0` a strong flare (the pass
  scales this internally onto the raw additive strength it wants; values well
  past `1` haze the stone and aren't the dial's intent).
- Per-stone override: a spec's own `glint` field outranks the page knob for
  that stone (`0` opts it out of the pass entirely, `null`/absent follows the
  knob). One flashy stone then needs no re-bake of every other — the page-wide
  knob and the per-spec field share the same chain, run at per-draw strength.

Only the ray-traced path is affected. With `tracer: false` (rasterised
`MeshPhysicalMaterial`) or on a software renderer (SwiftShader), the knob is
ignored — those paths don't emit the linear HDR the pass consumes.

### Why a hand-rolled chain, not `EffectComposer`

`EffectComposer` + `UnrealBloomPass` is the obvious choice, but both render the
whole post stack with `alpha` forced to 1. gemrenderer's whole output contract
is a **transparent PNG** per stone: the fitted frame crop, the drop shadow, and
the page background all depend on the stone's alpha silhouette. An opaque
framebuffer turns every stone into a black square.

So the pass is written here, small, and keeps the alpha channel:

```
scene ──▶ rtScene (RGBA half-float, full res, alpha = silhouette)
             │
             ├─ bright-pass + downsample ──▶ rtGlowA (half res)
             │        rtGlowA ── H blur ──▶ rtGlowB
             │        rtGlowB ── V blur ──▶ rtGlowA
             │
             └─ composite:  scene.rgb + glow * strength  ──▶ canvas
                            final.a = scene.a
```

- **Half-float targets.** The tracer writes linear HDR; an 8-bit target would
  clamp the very glints the pass exists to spread. `renderer.capabilities
.isWebGL2` gates it (three ≥ 0.163 is WebGL2-only anyway).
- **Half-res glow.** The bright-pass renders straight into a half-resolution
  target, so the downsample is free (bilinear). The blur runs there too — a
  soft glow needs no full-res detail, and the cost is a quarter of the area.
- **Two-pass separable Gaussian.** Nine taps adapted from three.js's
  `HorizontalBlurShader` / `VerticalBlurShader` (MIT) — the same linear-sampled
  kernel three.js ships. One material, a `uDir` uniform, two draws.
- **Alpha preserved.** The composite writes `scene.a`, so the glow lives
  _inside_ the stone's silhouette. This is deliberate: the fitted frame crop is
  tight around the stone (plus rotation headroom), and a halo painted outside
  the silhouette would be clipped by that crop and would also leak into the
  transparent PNG. The trade-off — no outer halo over the page — is the price
  of the transparent-image contract. `glow * strength` is clamped to 1 with the
  scene before sRGB encoding, matching the pass-off look.

### The tracer's HDR branch

`makeTracerMaterial` takes an `hdr` flag. When set it compiles the fragment
tail with `#define GLINT`, which skips the clamp + sRGB encode and writes the
linear `o` straight out. The Reinhard of the _base_ stays (facet detail under
1), so the HDR buffer is the same picture with its glints intact rather than a
raw radiance buffer with the whole facet range blown out.

Off, the shader is byte-identical to before.

### Where it hangs in the renderer

`renderGem` and `renderGemFrame` used to call `renderer.render(scene, camera)`
directly. Both now call `drawScene(c)`, which runs the glint chain when
`glintOn(c)` and otherwise does the plain draw. The frame-search path
(`renderSilhouette`) deliberately does **not** go through `drawScene`: the fit
depends on the geometry's alpha silhouette only, so it keeps the direct draw
and the cheap opaque material. The chain is created lazily on first use, torn
down when `glint` returns to 0, and its targets resize with
`configure({ resolution })` alongside the renderer.

## Verification

`demo/selftest.html` turns `glint` on and asserts the rendered PNG (a) is still
a valid transparent PNG with an alpha-0 corner, and (b) differs from the
same stone rendered with `glint: 0`.

## Credits

The bright-pass threshold with a soft knee follows three.js `UnrealBloomPass`
(MIT); the separable Gaussian taps follow three.js `HorizontalBlurShader` /
`VerticalBlurShader` (MIT). See `THIRD_PARTY_NOTICES.md`.
