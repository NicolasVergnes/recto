import type { ApkgErrorCode, ApkgPackage } from '$lib/import/apkg-read'
import type { ApkgWorkerRequest, ApkgWorkerResponse } from '$lib/import/apkg.worker'
import type { ImportPlan } from '$lib/import/plan'
import { MAX_IMAGE_SIDE } from '$lib/media/mime'
import { resizeImage } from '$lib/media/resize'

export class ApkgReadError extends Error {
  constructor(readonly code: ApkgErrorCode | 'anki21b') {
    super(code)
    this.name = 'ApkgReadError'
  }
}

/** Parses a package in a Web Worker (sql.js loaded on demand). */
export function readApkgFile(
  file: Blob,
  onProgress?: (ratio: number) => void,
): Promise<ApkgPackage> {
  return file.arrayBuffer().then(
    (buffer) =>
      new Promise<ApkgPackage>((resolve, reject) => {
        const worker = new Worker(new URL('../../import/apkg.worker.ts', import.meta.url), {
          type: 'module',
        })
        worker.onmessage = (event: MessageEvent<ApkgWorkerResponse>) => {
          const msg = event.data
          if (msg.type === 'progress') onProgress?.(msg.ratio)
          else {
            worker.terminate()
            if (msg.type === 'done') resolve(msg.pkg)
            else reject(new ApkgReadError(msg.code))
          }
        }
        worker.onerror = () => {
          worker.terminate()
          reject(new ApkgReadError('corrupt'))
        }
        const request: ApkgWorkerRequest = { bytes: new Uint8Array(buffer) }
        worker.postMessage(request, [buffer])
      }),
  )
}

/** Images over 1 280 px are resized like in the editor, under the same name (05 §2.3). */
export async function shrinkImages(plan: ImportPlan): Promise<void> {
  for (const media of plan.media) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(media.mime)) continue
    try {
      const bitmap = await createImageBitmap(media.blob)
      const large = Math.max(bitmap.width, bitmap.height) > MAX_IMAGE_SIDE
      bitmap.close()
      if (!large) continue
      const resized = await resizeImage(media.blob)
      media.blob = resized.blob
      media.mime = resized.blob.type
    } catch {
      // Unreadable image: kept as is.
    }
  }
}
