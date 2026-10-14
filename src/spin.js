// ── Drag-to-spin ──
// A framework-free pointer state machine: horizontal drags turntable the
// stone about the screen's vertical axis, vertical drags tilt it about the
// horizontal one, and releasing eases it back to the nearest full turn (the
// resting pose) instead of snapping. Kept separate from any DOM structure so
// the same gesture drives the vanilla `GemView`, a Vue component, or anything
// else that can point it at a canvas.
//
// The gesture stays a *tap* until it clearly commits to a spin, which keeps
// clicks and vertical page scrolling alive underneath the stone.

export function createGemSpin({
  draw, // (rotY, rotX) => Promise|void — paint the current rotation
  onTap, // () => void — a press without a spin
  onCommit, // async () => void — first spin begins: give us a canvas to draw on
  canSpin = () => true, // () => bool — false keeps every gesture a tap
  threshold = 5, // px of travel before a press commits to a spin
  spinRate = 0.0075, // rad per px horizontally
  tiltRate = 0.005, // rad per px vertically
  ease = 0.055, // per-frame pull back toward the resting pose
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
  let raf = 0
  let drawing = false
  let committed = false
  let reduceMotion = false
  let destroyed = false
  let auto = false // turntable mode: keeps spinning until switched off
  let lastT = 0

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
    if (drawing || destroyed) return
    drawing = true
    try {
      await draw?.(rot.y, rot.x)
    } catch {
      // A dropped frame just keeps the previous one; the next drag retries.
    }
    drawing = false
  }

  function frame(t) {
    raf = 0
    // Turntable mode rides the same rotation + draw path as a drag, so an
    // auto-spinning stone is lit and framed identically to a spun one.
    if (auto && !dragging) {
      const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0
      lastT = t
      rot.y += autoRate * dt
      paint()
      schedule()
      return
    }
    lastT = t
    if (!dragging) {
      // Ease home. Every full turn already spun is part of the resting pose,
      // so home is the nearest multiple of a full rotation — the stone glides
      // the short way in instead of snapping or coasting.
      const TAU = Math.PI * 2
      const ty = Math.round(rot.y / TAU) * TAU
      const tx = Math.round(rot.x / TAU) * TAU
      rot.y += (ty - rot.y) * ease
      rot.x += (tx - rot.x) * ease
      if (Math.abs(ty - rot.y) < 1.5e-3 && Math.abs(tx - rot.x) < 1.5e-3) {
        rot.y = 0
        rot.x = 0
        settled = true
        paint() // exact rest frame, identical to the static PNG
        return
      }
      schedule()
    }
    settled = false
    paint()
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
      committed = committed || auto // a live canvas is already on screen
      downX = lastX = e.clientX
      downY = lastY = e.clientY
      e.currentTarget?.setPointerCapture?.(e.pointerId)
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
        if (canSpin()) beginSpin()
        return
      }
      rot.y += (e.clientX - lastX) * spinRate
      rot.x += (e.clientY - lastY) * tiltRate
      lastX = e.clientX
      lastY = e.clientY
      schedule()
    },

    up() {
      if (!dragging) return
      dragging = false
      if (!spinning)
        onTap?.() // a tap or plain click
      else if (reduceMotion) {
        rot.y = 0
        rot.x = 0
        schedule() // reduced motion: jump straight home
      } else schedule() // ease back to the resting pose
    },

    /** Jump to a rotation without a gesture (auto-rotate, keyboard nudges). */
    set(y = rot.y, x = rot.x) {
      rot.y = y
      rot.x = x
      schedule()
    },

    /** Ease back to the resting pose (or jump, under reduced motion). */
    home() {
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
