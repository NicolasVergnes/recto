import type { Attachment } from 'svelte/attachments'
import { fitZoom, MIN_FIT_ZOOM } from './grid'

/**
 * Zooms the first child of a tile face out until the face has no scrollbar, down to
 * `MIN_FIT_ZOOM` (beyond, the face scrolls). Runs again whenever the face or its content
 * changes size (images decoded, formulas rendered, tile size changed). The zoomed content
 * lays out wider, so a couple of passes settle it; the result does not change its own input.
 */
export const fitContent: Attachment<HTMLElement> = (face) => {
  const content = face.firstElementChild
  if (!(content instanceof HTMLElement)) return
  const fit = () => {
    content.style.removeProperty('zoom')
    let zoom = 1
    for (let pass = 0; pass < 4; pass++) {
      const ratio = fitZoom(face.scrollHeight, face.clientHeight)
      if (ratio === 1) break
      const next = Math.max(MIN_FIT_ZOOM, Math.floor(zoom * ratio * 100) / 100)
      if (next === zoom) break
      zoom = next
      content.style.setProperty('zoom', String(zoom))
    }
  }
  const observer = new ResizeObserver(fit)
  observer.observe(face)
  observer.observe(content)
  return () => observer.disconnect()
}
