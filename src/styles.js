// Styles for the vanilla `GemView`, injected into the document once on first
// mount so a framework-free consumer can `new GemView(el)` with zero build
// setup. Everything is driven by custom properties, so you can also skip the
// injected sheet (`styles: false`) and style the `.gr-*` classes yourself.
export const GEM_STYLES = `
.gr-mount {
  position: relative;
  display: block;
  width: 100%;
  container-type: inline-size;
}

/* The frame the render is cropped to carries per-cut spin headroom, so the
   image scales by --gr-fit until the *stone* itself is the ladder's height:
   the extra transparent padding simply overflows the box rather than
   stretching the stone. */
.gr-wrap {
  display: block;
  width: 100%;
  border-radius: 12%;
}
.gr-wrap:focus-visible {
  outline: 2px solid var(--gr-base, #4b8fc4);
  outline-offset: 3px;
}

.gr-gem {
  display: block;
  max-width: none;
  width: calc(var(--gr-fit, 1) * 100cqw);
  /* Lock the box to the fitted frame's ratio from the first layout, so the
     img→canvas swap never reflows the row. */
  aspect-ratio: var(--gr-aspect, 1);
  margin-left: calc((1 - var(--gr-fit, 1)) * 50cqw);
  margin-bottom: calc(var(--gr-mb, 0) * 100cqw);
}
.gr-mount[data-shadow='on'] .gr-gem {
  filter: drop-shadow(0 1.2cqw 1.6cqw rgba(0, 0, 0, 0.45));
}

/* Space-holder while the three.js render loads (or without WebGL): a soft
   glowing orb in the gemstone's own palette — deliberately abstract, not a
   rival gem shape. */
.gr-orb {
  display: block;
  width: 82%;
  margin-inline: auto;
  aspect-ratio: 1;
  border-radius: 50%;
  background:
    radial-gradient(circle at 34% 28%, var(--gr-light, #9cf), transparent 55%),
    radial-gradient(circle at 50% 55%, var(--gr-base, #36c), var(--gr-dark, #123));
  opacity: 0.9;
}
.gr-mount[data-shadow='on'] .gr-orb {
  filter: drop-shadow(0 1.2cqw 1.6cqw rgba(0, 0, 0, 0.45));
}

/* pointer-events only matter once a WebGL render exists; pan-y keeps
   vertical page scrolling alive while horizontal drags spin the stone. */
.gr-grab {
  cursor: grab;
  touch-action: pan-y;
  -webkit-user-select: none;
  user-select: none;
}
.gr-grab:active {
  cursor: grabbing;
}
`

let injected = false

export function injectGemStyles() {
  if (injected || typeof document === 'undefined') return
  const style = document.createElement('style')
  style.dataset.gemrenderer = ''
  style.textContent = GEM_STYLES
  document.head.appendChild(style)
  injected = true
}
