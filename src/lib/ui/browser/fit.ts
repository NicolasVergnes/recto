import type { Attachment } from 'svelte/attachments'
import { fitZoom, imageCap, MIN_FIT_ZOOM } from './grid'

/**
 * Makes the first child of a tile face fit the face, which never scrolls: the images shrink
 * first (`--fit-img`, read by TileFace), then the whole content is zoomed out as much as needed.
 * Runs again whenever the face or its content changes size (images decoded, formulas rendered,
 * tile size changed). The zoomed content lays out wider, so a couple of passes settle it; the
 * result does not change its own input.
 */
export const fitContent: Attachment<HTMLElement> = (face) => {
  const content = face.firstElementChild
  if (!(content instanceof HTMLElement)) return
  const fit = () => {
    content.style.removeProperty('zoom')
    face.style.removeProperty('--fit-img')
    const style = getComputedStyle(face)
    const available =
      face.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    const images = [...content.querySelectorAll('img')]
    if (images.length > 0 && content.offsetHeight > available) {
      const heights = images.reduce((sum, img) => sum + img.getBoundingClientRect().height, 0)
      const cap = imageCap(available, content.offsetHeight, heights, images.length)
      face.style.setProperty('--fit-img', `${Math.floor(cap)}px`)
    }
    let zoom = 1
    for (let pass = 0; pass < 6; pass++) {
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
