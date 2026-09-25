import { fitWithin, MAX_IMAGE_SIDE } from './mime'

export interface EncodedImage {
  blob: Blob
  width: number
  height: number
}

/**
 * Resizes a raster image to fit 1280 px and re-encodes it as WebP 0.82, or JPEG 0.85 when the
 * browser cannot encode WebP (SPEC §5.2). Uses createImageBitmap + OffscreenCanvas, falling back
 * to a DOM canvas.
 */
export async function resizeImage(blob: Blob, max = MAX_IMAGE_SIDE): Promise<EncodedImage> {
  const bitmap = await createImageBitmap(blob)
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max)
    const webp = await encode(bitmap, width, height, 'image/webp', 0.82)
    const out =
      webp.type === 'image/webp' ? webp : await encode(bitmap, width, height, 'image/jpeg', 0.85)
    return { blob: out, width, height }
  } finally {
    bitmap.close()
  }
}

async function encode(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  type: string,
  quality: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    if (type === 'image/jpeg') fillWhite(ctx, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    return canvas.convertToBlob({ type, quality })
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  if (type === 'image/jpeg') fillWhite(ctx, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type, quality),
  )
}

/** JPEG has no alpha channel: paint transparent areas white. */
function fillWhite(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
}
