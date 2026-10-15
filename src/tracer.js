// Real-time gem light tracer — a per-pixel convex-polytope ray tracer used as
// the stone material for every spec (the optics ride in from the spec).
//
// DERIVED WORK — adapted from `src/shaders/hullDiamond.ts` and
// `src/lib/three/hullPlanes.ts` in ehsanwwe/diamond-shader-lab by Ehsan Moradi
// (MIT; see THIRD_PARTY_NOTICES.md, which lists the derivation function by
// function). Straight from upstream: the facet-plane extraction, the ray/hull
// intersection, the Schlick approximation, the internal bounce loop, the
// per-channel dispersion split, the monochrome `grayEnv` sampling and the
// Reinhard-plus-glints output shape. What this file adds on top is itemised
// under "Adaptations for coloured gemstones" below.
//
// The stone's facet planes of its convex hull are uploaded as uniforms, and
// each fragment traces the camera ray into the stone — Fresnel reflection,
// refraction in, internal total-internal-reflection bounces, refractive exit —
// with the three colour channels traced at slightly different IORs, so
// chromatic dispersion (fire) emerges from the light path itself rather than
// from painted tints.
//
// Adaptations for coloured gemstones:
//   • Beer–Lambert absorption: the transmitted light is attenuated by
//     exp(-σ·pathLength) accumulated across the internal path, σ derived from
//     the palette's body colour. Thick pavilions saturate, thin crowns stay
//     pale — the depth-dependent colour an albedo tint can never fake.
//   • Per-gem IOR and fire (dispersion) from real optical data, so a diamond
//     physically out-sparkles a benitoite.
//   • A procedural HDR studio environment (no 6 MB .hdr asset): a dark room
//     with a broad overhead softbox, two coloured strips and pin-point
//     "stars" — the high-contrast sources real gem photography is built from.
//   • Quality scales with the clarity: bounces grow with clarity, and
//     dispersion widens — but every clarity traces real light paths; the clarity
//     ladder modulates the fire, not whether the stone is glass.
//
// The fragment shader ends in Reinhard mapping + sRGB encode (the material is
// `toneMapped: false`), matching the source lab's approach of keeping the
// facet detail under 1.0 and re-adding the true glints on top.
//
// With `configure({ glint })` on, the material compiles an `hdr` variant
// instead: the tail writes the linear HDR `o` (base Reinhard still applied, so
// facet detail stays under 1) and skips the clamp + sRGB encode. The glint post
// pass (`src/glint.js`) then spreads the >1 pixels and does the display encode.

import { config } from './options.js'

export const MAX_PLANES = 96

const srgbToLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)

// σ per channel from the palette's body colour: the colour a slab of
// reference thickness transmits, inverted through Beer–Lambert. The 3.2
// divisor is that reference path length in stone-space units (a typical
// two-to-three-bounce journey through the pavilion).
function absorptionFor(colorHex) {
  const lin = [
    srgbToLinear(((colorHex >> 16) & 255) / 255),
    srgbToLinear(((colorHex >> 8) & 255) / 255),
    srgbToLinear((colorHex & 255) / 255),
  ]
  return lin.map((c) => Math.min(6, -Math.log(Math.max(c, 0.004)) / 3.2))
}

// ── Facet-plane extraction ──
// Facet planes of the geometry's convex hull, coplanar faces merged — the
// round brilliant merges down to its classic 57 planes, under the 96 cap.
// Dynamic import mirrors the renderer's lazy-three.js strategy: nothing here
// pulls three into the main bundle until a stone actually renders.
export async function hullPlanes(THREE, geometry) {
  const { ConvexHull } = await import('three/examples/jsm/math/ConvexHull.js')
  const pos = geometry.getAttribute('position')
  const seen = new Map()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    seen.set(
      `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`,
      new THREE.Vector3(x, y, z),
    )
  }
  const hull = new ConvexHull().setFromPoints([...seen.values()])
  const planes = []
  for (const face of hull.faces) {
    const n = face.normal // outward unit normal
    const d = n.dot(face.edge.head().point) // plane offset
    let merged = false
    for (const p of planes) {
      if (p.n.dot(n) > 0.985 && Math.abs(p.d - d) < 0.03) {
        merged = true
        break
      }
    }
    if (!merged) planes.push({ n: n.clone(), d })
  }
  const count = Math.min(planes.length, MAX_PLANES)
  const data = new Float32Array(MAX_PLANES * 4)
  for (let i = 0; i < count; i++) {
    data[i * 4] = planes[i].n.x
    data[i * 4 + 1] = planes[i].n.y
    data[i * 4 + 2] = planes[i].n.z
    data[i * 4 + 3] = planes[i].d
  }
  return { data, count: planes.length }
}

// Procedural HDR studio: dark cool room, big overhead softbox, a cool strip
// and a warm strip, and three pin-sharp points for the star flash. Linear
// values above 1.0 are the glints the Reinhard/HDR split downstream reacts to.
const envGLSL = /* glsl */ `
vec3 studioEnv(vec3 d){
  float up = clamp(d.y*.5+.5, 0., 1.);
  vec3 c = mix(vec3(0.030,0.040,0.062), vec3(0.130,0.170,0.240), up);
  float key = smoothstep(.82,.985, dot(d, normalize(vec3(.18,.92,.34))));
  c += vec3(6.5,6.0,5.4) * key;
  // Front-side panel: the camera-facing crown mirrors it, which is what
  // keeps a resting stone from reading as a black gem. Aimed near
  // camera-vertical (not overhead) so a nearly-top-down table reflects the
  // key light instead of washing this panel flat gray across the stone.
  float s3 = smoothstep(.90,.997, dot(d, normalize(vec3(.05,.15,.99))));
  c += vec3(2.3,2.5,2.9) * s3;
  float s1 = smoothstep(.952,.995, dot(d, normalize(vec3(-.85,.30,-.42))));
  c += vec3(1.0,1.6,2.6) * s1 * 4.5;
  float s2 = smoothstep(.962,.996, dot(d, normalize(vec3(.75,.12,.63))));
  c += vec3(2.2,1.3,.7) * s2 * 2.6;
  c += vec3(.05,.08,.13) * smoothstep(.15,-.9,d.y);
  float p1 = pow(max(dot(d,normalize(vec3(.40,.75,.53))),0.),640.);
  float p2 = pow(max(dot(d,normalize(vec3(-.62,.55,-.34))),0.),640.);
  float p3 = pow(max(dot(d,normalize(vec3(.10,-.55,.83))),0.),900.);
  // Hot pin-points: as the stone rotates, facet mirrors sweep across these
  // and flash — the scintillation of a cut stone, for free.
  c += vec3(13.,13.,15.)*(p1+p2*.8) + vec3(10.,5.5,2.)*p3;
  return c;
}`

const tracerGLSL = /* glsl */ `
uniform float uIor,uDispersion,uExposure,uContrast,uHighlight;
uniform vec3 uAbsorb;
uniform mat3 uEnvRot;
uniform int uPlaneCount;
uniform vec4 uPlanes[${MAX_PLANES}];   // xyz = outward unit normal, w = offset

${envGLSL}

// The refraction/reflection light is read in monochrome: a gem's colour
// comes from the absorption along the path, its fire from the per-channel
// IOR spread — coloured env light on top of both just muddies them.
vec3 grayEnv(vec3 d){
  vec3 c = studioEnv(uEnvRot*d);
  return vec3(dot(c,vec3(.299,.587,.114)));
}

// Ray vs convex hull: entry (tN,nN) and exit (tF,nF); inside is
// dot(n,x) <= w for every plane.
bool intersectHull(vec3 ro,vec3 rd,out float tN,out vec3 nN,out float tF,out vec3 nF){
  tN=-1e9;tF=1e9;nN=vec3(0.);nF=vec3(0.);
  for(int i=0;i<${MAX_PLANES};i++){
    if(i>=uPlaneCount)break;
    vec4 pl=uPlanes[i];vec3 n=pl.xyz;float w=pl.w;
    float denom=dot(n,rd);
    float side=dot(n,ro)-w;
    if(abs(denom)<1e-6){ if(side>0.)return false; }
    else{
      float t=-side/denom;
      if(denom<0.){ if(t>tN){tN=t;nN=n;} }
      else{ if(t<tF){tF=t;nF=n;} }
    }
  }
  return tF>=tN && tF>0.;
}

float schlick(vec3 ray,vec3 n,float ior){
  float r0=(1.-ior)/(1.+ior);r0*=r0;
  return clamp(r0+(1.-r0)*pow(1.-max(dot(-ray,n),0.),5.),0.,.94);
}

vec3 traceStone(vec3 ro,vec3 rd,float ior){
  float tN,tF;vec3 nN,nF;
  if(!intersectHull(ro,rd,tN,nN,tF,nF))return grayEnv(rd);
  tN=max(tN,0.);
  vec3 reflected=grayEnv(reflect(rd,nN));
  vec3 ray=refract(rd,nN,1./ior);
  if(dot(ray,ray)<1e-8)return reflected;   // numerically guarded full reflect
  vec3 pos=ro+rd*tN;
  vec3 transmitted=vec3(0.);
  float pathLen=0.;
  for(int b=0;b<BOUNCES;b++){
    float eN,eF;vec3 enN,enF;
    vec3 o=pos+ray*.0015;
    if(!intersectHull(o,ray,eN,enN,eF,enF))break;
    pathLen+=eF;
    vec3 exitPos=o+ray*eF;
    vec3 outN=enF;
    vec3 exitRay=refract(ray,-outN,ior);   // normal must oppose the outgoing ray
    if(dot(exitRay,exitRay)>1e-8){
      transmitted=grayEnv(exitRay)*exp(-uAbsorb*pathLen);
      break;
    }
    ray=reflect(ray,outN);                 // total internal reflection
    pos=exitPos;
    if(b==BOUNCES-1)transmitted=grayEnv(ray)*exp(-uAbsorb*pathLen)*.7;
  }
  float f=schlick(rd,nN,ior);
  return mix(transmitted,reflected,f);
}

vec3 traceStoneHDR(vec3 ro,vec3 rd){
  float spread=.032*uDispersion;
  vec3 col;
  col.r=traceStone(ro,rd,uIor+spread*.25).r;
  col.g=traceStone(ro,rd,uIor+spread*.75).g;
  col.b=traceStone(ro,rd,uIor+spread).b;
  // Pivot sits below mid: most exit rays carry only room ambient, and the
  // pivot pulls the light-path mid-tones up without lifting the deep
  // total-internal-reflection darks — the scintillation keeps its range.
  col=(col-.30)*uContrast+.30;
  return max(col*uExposure,vec3(0.));
}`

const vertexGLSL = /* glsl */ `
varying vec3 vLocal;
void main(){
  vLocal=position;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}`

const fragmentGLSL = /* glsl */ `
precision highp float;
uniform vec3 uLocalCam;   // camera position in the stone's own space
uniform vec3 uBody;       // the palette's linear body colour
uniform float uBling;     // clarity ramp: 0 = saturated opaque gem, 1 = full light path
varying vec3 vLocal;

${tracerGLSL}

void main(){
  vec3 rd=normalize(vLocal-uLocalCam);
  vec3 col=traceStoneHDR(uLocalCam,rd);
  // Clarity blend: cheap stones sit toward their flat body colour — opaque,
  // nearly glass-free — and the full traced light path (sparkle, fire, TIR
  // darks) fades in as the clarity climbs.
  col=mix(uBody*.85,col,uBling);
  vec3 base=col/(1.+col);                          // Reinhard: facet detail < 1
  float l=dot(col,vec3(.299,.587,.114));
  vec3 o=base+col*smoothstep(1.,4.,l)*uHighlight;  // glints ride above
#ifdef GLINT
  // Linear HDR: leave the glints above 1 for the bloom pass to spread, and let
  // it do the display encode.
  gl_FragColor=vec4(o,1.);
#else
  o=clamp(o,0.,1.);
  o=mix(o*12.92,pow(o,vec3(1./2.4))*1.055-.055,step(vec3(.0031308),o)); // sRGB
  gl_FragColor=vec4(o,1.);
#endif
}`

// One ShaderMaterial per baked stone (the stones cache already keys gem+clarity):
// the bounce count is a #define, so higher clarity levels compile—and pay for—more
// internal light paths. Optics (`ior`, `fire`, `bounces`) come from the spec.
export function makeTracerMaterial(
  THREE,
  {
    clarity,
    colorHex,
    ior = 1.77,
    fire = 0.4,
    bright = 1,
    bounces = null,
    hdr = false,
  },
) {
  const t = Math.min(9, Math.max(0, clarity))
  // Internal light paths start at three bounces even for the cheapest
  // stones — glassiness isn't a luxury feature; higher clarity levels lengthen the
  // journey toward the full fire-and-blaze. `configure({ bounces })` pins
  // the count for every clarity instead (quality dial in the demo), and a
  // spec's own `bounces` outranks even that — one stone can spend more paths
  // without re-baking every other.
  const paths = Math.min(
    8,
    bounces ?? config.bounces ?? 3 + Math.floor(t * 0.25),
  )
  const absorb = absorptionFor(colorHex)
  const body = [
    srgbToLinear(((colorHex >> 16) & 255) / 255),
    srgbToLinear(((colorHex >> 8) & 255) / 255),
    srgbToLinear((colorHex & 255) / 255),
  ]
  // Clarity ramp for the light path itself: even clarity 0 runs ~⅔ of the traced
  // look — refractive from the first rung, the ladder modulates brightness
  // and fire rather than pulling the stone toward flat body colour — and
  // clarity 9 the full blaze, slightly past 1 so a diamond's fire can overshoot
  // a mere full blend.
  const bling = 0.68 + 0.37 * (t / 9)
  return new THREE.ShaderMaterial({
    vertexShader: vertexGLSL,
    fragmentShader: `${hdr ? '#define GLINT\n' : ''}#define BOUNCES ${paths}\n${fragmentGLSL}`,
    uniforms: {
      uIor: { value: ior },
      uDispersion: {
        value: fire * (0.3 + 0.7 * (t / 9)) * config.dispersion,
      },
      uExposure: { value: 1.35 * bright * config.exposure },
      uContrast: { value: 1.0 + 0.02 * t },
      uBling: { value: bling },
      uBody: { value: new THREE.Vector3(...body) },
      uHighlight: { value: (1.25 + 0.22 * t) * bright },
      uAbsorb: { value: new THREE.Vector3(...absorb) },
      uEnvRot: { value: new THREE.Matrix3() },
      uLocalCam: { value: new THREE.Vector3() },
      uPlaneCount: { value: 0 },
      uPlanes: { value: [] },
    },
    // The shader owns the output: Reinhard + sRGB itself, or (glint on) linear
    // HDR for the post pass — never three's tone mapping.
    toneMapped: false,
    // DoubleSide, like the physical materials: a few legacy strips in the
    // hand-built geometries wind inward, and FrontSide would punch
    // see-through holes there. The tracer ignores rasterised normals anyway
    // — it re-derives entry from the hull — so a back face traced from the
    // camera simply shows what its front face would, and the depth test
    // keeps every real front-face pixel in front.
    side: THREE.DoubleSide,
  })
}

// Upload a stone's hull planes into its tracer uniforms. The array must be
// the *full* declared length (zero-padded planes sit at the far end of the
// sorted-free list and are skipped by the shader's count break; three
// flattens every declared element on upload).
export async function loadTracerHull(THREE, material, geometry) {
  const { data, count } = await hullPlanes(THREE, geometry)
  material.uniforms.uPlaneCount.value = Math.min(count, MAX_PLANES)
  const arr = []
  for (let i = 0; i < MAX_PLANES; i++)
    arr.push(
      new THREE.Vector4(
        data[i * 4] || 0,
        data[i * 4 + 1] || 0,
        data[i * 4 + 2] || 0,
        data[i * 4 + 3] || 0,
      ),
    )
  material.uniforms.uPlanes.value = arr
  return count
}
