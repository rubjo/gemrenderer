# Third-party notices

## three.js — © three.js authors, MIT

**Repository:** https://github.com/mrdoob/three.js

three.js is a peer dependency, but the glint bloom pass (`src/glint.js`) also
adapts two of its shader techniques rather than only importing the library:

- **Bright-pass threshold.** The `smoothstep` threshold-with-knee that isolates
  the hot pixels follows the bright-pass stage of `UnrealBloomPass`
  (`examples/jsm/postprocessing/UnrealBloomPass.js`).
- **Separable Gaussian blur.** The nine-tap kernel in `BLUR` — including the
  1.3846 / 3.2308 linear-sample offsets and the 0.227 / 0.316 / 0.070 weights —
  is the kernel from `HorizontalBlurShader` / `VerticalBlurShader`
  (`examples/jsm/shaders/`), folded into one shader with a direction uniform.

Both are MIT-licensed; the licence below is reproduced because their code ships
here.

```
MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## diamond-shader-lab — © Ehsan Moradi, MIT

**Repository:** https://github.com/ehsanwwe/diamond-shader-lab
(upstream sources reviewed at commit `edd718e`)

gemrenderer's per-pixel gem tracer (`src/tracer.js`) is a derivative work of
`src/shaders/hullDiamond.ts` and `src/lib/three/hullPlanes.ts` from that
project, adapted for coloured gemstones. The upstream MIT licence below is
reproduced because substantial portions of its code are distributed here.

### What came from diamond-shader-lab

The analytic convex-polytope tracing approach and, in several places, its code:

- **Facet-plane extraction** — `hullPlanes()` is the upstream function, with
  vertex pre-deduplication and a lazy `ConvexHull` import added; the coplanar
  merge thresholds (`0.985` / `0.03`), the `MAX_PLANES = 96` packing and the
  `{ data, count }` shape are its own.
- **Ray/hull intersection** — `intersectHull()` is upstream's, essentially
  line for line (entry/exit half-space scan over the plane uniforms).
- **Fresnel approximation** — `schlick()` is upstream's, unchanged.
- **The internal light path** — `traceStone()` follows upstream
  `traceDiamond()`: refract in, bounce loop with total internal reflection,
  exit refract against `-outN`, final-bounce fallback, Schlick-weighted mix.
- **Chromatic dispersion** — `traceStoneHDR()` keeps upstream's per-channel IOR
  split (`.25 / .75 / 1` of `spread = .032 * uDispersion`) and exposure stage.
- **Monochrome environment sampling** — `grayEnv()` with the `.299/.587/.114`
  luma weights, and rotating the lookup by `uEnvRot`, are upstream's.
- **HDR output shape** — the Reinhard mapping of facet detail with true glints
  added back above 1.0 (`smoothstep(1., 4., l) * uHighlight`) is upstream's.

### What gemrenderer adds

- **Beer–Lambert absorption** along the internal path
  (`uAbsorb` derived from each palette's body colour), which is what makes a
  thick pavilion saturate and a thin crown stay pale.
- **Per-gem optical constants** — real IOR and dispersion for ten gemstones.
- **A procedural HDR studio** in GLSL replacing upstream's downloaded `.hdr`
  environment (a dark room, an overhead softbox, two coloured strips, three
  pin-point sources).
- **A tier blend** (`uBling`) between body colour and traced light path, plus
  an in-shader sRGB encode so the material needs no post pipeline.
- **Ten hand-built faceting cuts** (`src/cuts.js`) after the diagrams at
  [facetdiagrams.net](http://www.facetdiagrams.net) — none of that geometry
  comes from upstream.
- Everything around it: the shared-context renderer, per-cut frame fitting,
  placeholder/caching behaviour, the `GemView` component and the gesture layer.

### Upstream licence text

```
MIT License

Copyright (c) 2026 Ehsan Moradi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
