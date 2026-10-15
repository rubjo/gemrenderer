// A small, hand-rolled bloom pass for the ray-traced stone — the `glint` knob.
//
// The tracer already emits linear HDR (facet mirrors that sweep the studio's
// pin-points land well above 1). Off, the tracer's own fragment tail clamps
// that to 1 and sRGB-encodes in-shader. On, the tail instead writes linear HDR
// (`#define GLINT`) and this pass spreads the hot pixels into their neighbours
// before the display encode — so a bright facet reads as a soft flare instead
// of a hard-edged white polygon.
//
// It is deliberately *not* EffectComposer/UnrealBloomPass: those force alpha to
// 1, and gemrenderer's whole contract is a transparent PNG per stone (the
// fitted-frame crop and the page background both ride the alpha silhouette).
// This chain keeps `alpha = scene.a` end to end and runs the glow at half
// resolution, so the cost is a few small draws rather than a full-res stack.
//
// The blur taps and the bright-pass threshold-with-knee are adapted from
// three.js (MIT) — see THIRD_PARTY_NOTICES.md.

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`

// Threshold the scene down to its hot pixels. `smoothstep` gives the soft knee
// so a facet crossing the threshold fades in rather than popping.
const BRIGHT = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform float uThreshold, uKnee;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  float l = max(max(c.r, c.g), c.b);
  float w = smoothstep(uThreshold, uThreshold + uKnee, l);
  gl_FragColor = vec4(c * w, 1.0);
}`

// One separable Gaussian, run horizontally then vertically (the `uDir` uniform
// switches axis). Nine taps, the outer two pairs folded onto linear samples —
// the kernel three.js's Horizontal/VerticalBlurShader ships.
const BLUR = /* glsl */ `
precision highp float;
uniform sampler2D tBlur;
uniform vec2 uTexel, uDir;
varying vec2 vUv;
void main(){
  vec4 s = texture2D(tBlur, vUv) * 0.2270270270;
  vec2 a = uDir * uTexel * 1.3846153846;
  vec2 b = uDir * uTexel * 3.2307692308;
  s += texture2D(tBlur, vUv + a) * 0.3162162162;
  s += texture2D(tBlur, vUv - a) * 0.3162162162;
  s += texture2D(tBlur, vUv + b) * 0.0702702703;
  s += texture2D(tBlur, vUv - b) * 0.0702702703;
  gl_FragColor = s;
}`

// The scene back over the glow, alpha untouched, then the display encode the
// tracer's own tail would otherwise have done.
const COMPOSITE = /* glsl */ `
precision highp float;
uniform sampler2D tScene, tGlow;
uniform float uStrength;
varying vec2 vUv;
void main(){
  vec4 s = texture2D(tScene, vUv);
  vec3 g = texture2D(tGlow, vUv).rgb;
  vec3 c = clamp(s.rgb + g * uStrength, 0.0, 1.0);
  c = mix(c * 12.92, pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, step(vec3(0.0031308), c));
  gl_FragColor = vec4(c, s.a);
}`

const GLOW_SCALE = 0.5 // glow buffers run at half res: soft, and a ¼ of the area

// The `glint` knob runs 0..1, so the composite gain maps it onto the raw
// additive strength the pass actually wants: 1.0 lands on a strong-but-clean
// flare (old raw 0.05) and anything much past 1 visually hazing the stone.
// Without it the knob's useful range was ~0.05 out of a nominal 1.2 — the
// whole top of the dial was "too blurry".
const STRENGTH_GAIN = 0.05

/**
 * Build the glint chain for one renderer, or `null` if the context can't
 * render to float targets (the caller then draws straight to the canvas).
 *
 * @param {object} THREE the three.js module
 * @param {import('three').WebGLRenderer} renderer
 * @param {number} resolution the square scene target's edge in px
 */
export function createGlint(THREE, renderer, resolution) {
  if (!renderer.capabilities.isWebGL2) return null

  const target = (w, h, depth) =>
    new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      depthBuffer: depth,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    })

  const mat = (fragmentShader, uniforms) =>
    new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    })

  // A single oversized triangle covers the clip-space square; its uv runs 0..2
  // so the visible 0..1 region maps exactly. Cheaper than a quad and needs no
  // orthographic camera — the vertex shader ignores the camera entirely.
  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  )
  geo.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2),
  )
  const quad = new THREE.Mesh(geo, null)
  quad.frustumCulled = false
  const cam = new THREE.Camera()

  const bright = mat(BRIGHT, {
    tScene: { value: null },
    uThreshold: { value: 1.0 },
    uKnee: { value: 0.6 },
  })
  const blur = mat(BLUR, {
    tBlur: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uDir: { value: new THREE.Vector2(1, 0) },
  })
  const composite = mat(COMPOSITE, {
    tScene: { value: null },
    tGlow: { value: null },
    uStrength: { value: 0.4 * STRENGTH_GAIN },
  })

  let rtScene = null
  let rtGlowA = null
  let rtGlowB = null
  let gw = 0
  let gh = 0

  function setSize(res) {
    const w = Math.max(1, Math.round(res))
    const h = w
    if (!rtScene) rtScene = target(w, h, true)
    else rtScene.setSize(w, h)
    gw = Math.max(1, Math.round(w * GLOW_SCALE))
    gh = Math.max(1, Math.round(h * GLOW_SCALE))
    if (!rtGlowA) {
      rtGlowA = target(gw, gh, false)
      rtGlowB = target(gw, gh, false)
    } else {
      rtGlowA.setSize(gw, gh)
      rtGlowB.setSize(gw, gh)
    }
    blur.uniforms.uTexel.value.set(1 / gw, 1 / gh)
  }
  setSize(resolution)

  function render(scene, camera, strength) {
    // 1. the scene, linear HDR, into the float target (alpha = silhouette).
    renderer.setRenderTarget(rtScene)
    renderer.render(scene, camera)
    // 2. threshold + downsample into the half-res glow buffer.
    quad.material = bright
    bright.uniforms.tScene.value = rtScene.texture
    renderer.setRenderTarget(rtGlowA)
    renderer.render(quad, cam)
    // 3. blur horizontally, then vertically.
    quad.material = blur
    blur.uniforms.tBlur.value = rtGlowA.texture
    blur.uniforms.uDir.value.set(1, 0)
    renderer.setRenderTarget(rtGlowB)
    renderer.render(quad, cam)
    blur.uniforms.tBlur.value = rtGlowB.texture
    blur.uniforms.uDir.value.set(0, 1)
    renderer.setRenderTarget(rtGlowA)
    renderer.render(quad, cam)
    // 4. scene + glow over the canvas, alpha preserved, then sRGB.
    quad.material = composite
    composite.uniforms.tScene.value = rtScene.texture
    composite.uniforms.tGlow.value = rtGlowA.texture
    composite.uniforms.uStrength.value = strength * STRENGTH_GAIN
    renderer.setRenderTarget(null)
    renderer.render(quad, cam)
  }

  function dispose() {
    rtScene?.dispose()
    rtGlowA?.dispose()
    rtGlowB?.dispose()
    geo.dispose()
    bright.dispose()
    blur.dispose()
    composite.dispose()
  }

  return { render, setSize, dispose }
}
