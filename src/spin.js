// ── Drag-to-spin ──
// A framework-free pointer state machine: horizontal drags turntable the
// stone about the screen's vertical axis, vertical drags tilt it about the
// horizontal one, and releasing keeps the flick going before it eases back to
// the resting pose. Kept separate from any DOM structure so the same gesture
// drives the vanilla `GemView`, a Vue component, or anything else that can
// point it at a canvas.
//
// A release carries the drag's velocity into a short momentum coast, so a
// quick flick sends the stone spinning on for another turn or so; once it
// slows it eases smoothly onto the nearest full turn (every full turn looks
// identical, so that *is* the resting pose). The gesture stays a *tap* until
// it clearly commits to a spin, which keeps clicks and vertical page scrolling
// alive underneath the stone.
import { clamp, lerpDt, roundToTau } from './math.js'

export function createGemSpin({
  draw, // (rotY, rotX) => Promise|void — paint the current rotation
  onTap, // () => void — a press without a spin
  onCommit, // async () => void — first spin begins: give us a canvas to draw on
  canSpin = () => true, // () => bool — false keeps every gesture a tap
  threshold = 5, // px of travel before a press commits to a spin
  spinRate = 0.012, // rad per px horizontally
  tiltRate = 0.007, // rad per px vertically
  friction = 2.4, // 1/s — momentum decay after release
  settleRate = 5.5, // 1/s — pull back onto the resting pose
  minVelocity = 0.3, // rad/s — coast ends below this, then it settles
  maxVelocity = 13, // rad/s — cap on a flick's launch speed
  velocityBlend = 0.5, // smoothing of the per-move velocity estimate
  releaseGrace = 90, // ms — a hold this long before release is not a flick
  autoRate = 0.45, // rad/s while `auto(true)` is running
} = {}) {
  const rot = { y: 0, x: 0 } // spin + tilt, unbounded while dragging
  let dragging = false
  let spinning = false // this gesture committed to a spin
  let settled = true // at (or eased back to) the resting pose
  let downX = 0
  let downY = 0
  let lastX = 0
  let lastY = 0
  let lastMoveT = 0
  let raf = 0
  let drawing = false
  let committed = false
  let reduceMotion = false
  let destroyed = false
  let auto = false // turntable mode: keeps spinning until switched off
  let lastT = 0
  let vY = 0 // rad/s — horizontal velocity carried out of a drag
  let vX = 0 // rad/s — vertical velocity
  let coasting = false // riding a release's momentum
  let pending = false // a repaint arrived while a draw was in flight

  const now = () =>
    typeof performance !== 'undefined' ? performance.now() : Date.now()

  function schedule() {
    if (!raf && !destroyed) raf = requestAnimationFrame(frame)
  }

  async function beginSpin() {
    spinning = true
    if (committed) return
    committed = true
    reduceMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')
      ?.matches
    await onCommit?.()
  }

  async function paint() {
    if (destroyed) return
    // A re-bake can hold the single draw slot for seconds; a repaint that
    // lands meanwhile (e.g. a configure() swapped in a fresh canvas) must not
    // be dropped, or the new canvas stays empty. Redraw at the latest
    // rotation once the in-flight draw lands.
    if (drawing) {
      pending = true
      return
    }
    drawing = true
    try {
      await draw?.(rot.y, rot.x)
    } catch {
      // A dropped frame just keeps the previous one; the next drag retries.
    }
    drawing = false
    if (pending && !destroyed) {
      pending = false
      schedule()
    }
  }

  function frame(t) {
    raf = 0
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0
    lastT = t
    // Turntable mode rides the same rotation + draw path as a drag, so an
    // auto-spinning stone is lit and framed identically to a spun one.
    if (auto && !dragging) {
      rot.y += autoRate * dt
      settled = false
      paint()
      schedule()
      return
    }
    if (dragging) {
      settled = false
      paint()
      return
    }
    if (reduceMotion) {
      rot.y = 0
      rot.x = 0
      settled = true
      paint()
      return
    }
    if (coasting) {
      // Momentum: integrate the launch velocity and let it decay. Once it has
      // slowed past minVelocity the stone is handed to the settle ease below,
      // so the coast ends in a smooth deceleration rather than a jolt.
      rot.y += vY * dt
      rot.x += vX * dt
      const decay = Math.exp(-friction * dt)
      vY *= decay
      vX *= decay
      if (Math.abs(vY) < minVelocity) vY = 0
      if (Math.abs(vX) < minVelocity) vX = 0
      if (vY === 0 && vX === 0) coasting = false
      settled = false
      paint()
      schedule()
      return
    }
    // Ease home. Every full turn already spun is part of the resting pose, so
    // home is the nearest multiple of a full rotation — the stone glides the
    // short way in instead of snapping.
    const ty = roundToTau(rot.y)
    const tx = roundToTau(rot.x)
    const f = lerpDt(settleRate, dt)
    rot.y += (ty - rot.y) * f
    rot.x += (tx - rot.x) * f
    if (Math.abs(ty - rot.y) < 0.01 && Math.abs(tx - rot.x) < 0.01) {
      rot.y = 0
      rot.x = 0
      settled = true
      paint() // exact rest frame, identical to the static PNG
      return
    }
    settled = false
    paint()
    schedule()
  }

  return {
    rot,
    get dragging() {
      return dragging
    },
    get settled() {
      return settled
    },

    down(e) {
      dragging = true
      spinning = false
      coasting = false
      vY = 0
      vX = 0
      committed = committed || auto // a live canvas is already on screen
      downX = lastX = e.clientX
      downY = lastY = e.clientY
      lastMoveT = now()
      try {
        e.currentTarget?.setPointerCapture?.(e.pointerId)
      } catch {
        // Some environments (or a pointer that already lifted) reject the
        // capture; the drag still works without it.
      }
    },

    move(e) {
      if (!dragging) return
      if (!spinning) {
        // Keep taps (and the page's vertical scroll) alive until the gesture
        // clearly commits to a spin.
        if (
          Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) <
          threshold
        )
          return
        lastX = e.clientX
        lastY = e.clientY
        lastMoveT = now()
        if (canSpin()) beginSpin()
        return
      }
      const dx = (e.clientX - lastX) * spinRate
      const dy = (e.clientY - lastY) * tiltRate
      rot.y += dx
      rot.x += dy
      // Track the drag's speed so a release can inherit it. Smooth the
      // per-move estimate (pointer events are noisy) and cap it.
      const t = now()
      const dt = t - lastMoveT
      if (dt > 1) {
        const instY = clamp(dx / (dt / 1000), -maxVelocity, maxVelocity)
        const instX = clamp(dy / (dt / 1000), -maxVelocity, maxVelocity)
        vY += (instY - vY) * velocityBlend
        vX += (instX - vX) * velocityBlend
      }
      lastMoveT = t
      lastX = e.clientX
      lastY = e.clientY
      schedule()
    },

    up() {
      if (!dragging) return
      dragging = false
      if (!spinning) {
        onTap?.() // a tap or plain click
        return
      }
      if (reduceMotion) {
        rot.y = 0
        rot.x = 0
        vY = 0
        vX = 0
        coasting = false
        settled = true
        schedule() // reduced motion: jump straight home
        return
      }
      // A stone held still before release should not fling: only keep the
      // velocity if the pointer was still moving when it lifted.
      if (now() - lastMoveT > releaseGrace) {
        vY = 0
        vX = 0
      }
      coasting = Math.abs(vY) >= minVelocity || Math.abs(vX) >= minVelocity
      schedule()
    },

    /** Jump to a rotation without a gesture (auto-rotate, keyboard nudges). */
    set(y = rot.y, x = rot.x) {
      rot.y = y
      rot.x = x
      coasting = false
      schedule()
    },

    /** Ease back to the resting pose (or jump, under reduced motion). */
    home() {
      coasting = false
      if (reduceMotion) {
        rot.y = 0
        rot.x = 0
      }
      schedule()
    },

    /** Turntable on/off — the stone keeps spinning until switched off. */
    auto(on = true, rate) {
      auto = !!on
      if (rate != null) autoRate = rate
      lastT = 0
      if (auto) {
        // A spin with no canvas to draw into is just a timer: commit the same
        // way a drag does, so an auto-spinning stone is a live canvas too.
        if (!committed) beginSpin()
        schedule()
      } else if (!dragging) schedule() // ease back home from wherever it stands
    },

    destroy() {
      destroyed = true
      cancelAnimationFrame(raf)
      raf = 0
    },
  }
}
