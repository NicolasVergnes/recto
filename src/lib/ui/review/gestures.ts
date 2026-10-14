import type { Action } from 'svelte/action'

export interface GestureOptions {
  enabled: boolean
  revealed: boolean
  onreveal: () => void
  /** Right: Good (3), left: Again (1). */
  onrate: (rating: 1 | 3) => void
}

/** Horizontal travel that rates a card (CSS px). */
const SWIPE = 80
/** Below this, a press is a touch, not a move. */
const TOUCH = 10

/**
 * Review gestures (04-UI §2.2): touching the hidden card shows the answer; once shown, a swipe
 * right rates Good, left Again. The pointer is captured so the gesture survives leaving the card,
 * and a cancel by the browser (scroll, edge gesture, long press) just resets it.
 */
export const reviewGestures: Action<HTMLElement, GestureOptions> = (node, initial) => {
  let opts = initial
  let start: { id: number; x: number; y: number } | null = null

  /** The card follows the finger (no transition while it does). */
  function shift(dx: number) {
    node.style.transform = `translateX(${dx}px)`
    node.style.transition = 'none'
  }

  /** Back in place: sliding (the CSS transition) if nothing happened, at once for a new card. */
  function reset(slide: boolean) {
    start = null
    node.style.transform = ''
    node.style.transition = slide ? '' : 'none'
  }

  function down(e: PointerEvent) {
    if (!opts.enabled || !e.isPrimary || start) return
    if (e.target instanceof Element && e.target.closest('a, button, audio, video, input')) return
    start = { id: e.pointerId, x: e.clientX, y: e.clientY }
    node.setPointerCapture(e.pointerId)
  }

  function move(e: PointerEvent) {
    if (start?.id !== e.pointerId || !opts.revealed) return
    shift(e.clientX - start.x)
  }

  function up(e: PointerEvent) {
    if (start?.id !== e.pointerId) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    const horizontal = Math.abs(dx) > Math.abs(dy)
    const rate = opts.revealed && horizontal && Math.abs(dx) > SWIPE
    reset(!rate)
    if (rate) opts.onrate(dx > 0 ? 3 : 1)
    else if (!opts.revealed && (horizontal || Math.abs(dy) < TOUCH)) opts.onreveal()
  }

  function cancel() {
    reset(true)
  }

  node.addEventListener('pointerdown', down)
  node.addEventListener('pointermove', move)
  node.addEventListener('pointerup', up)
  node.addEventListener('pointercancel', cancel)
  return {
    update(next) {
      opts = next
    },
    destroy() {
      node.removeEventListener('pointerdown', down)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', up)
      node.removeEventListener('pointercancel', cancel)
    },
  }
}
