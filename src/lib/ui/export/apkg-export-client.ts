import { gatherApkgExport, type ApkgExportScope } from '$lib/db/export-apkg'
import type { ApkgExportReport, ApkgExportResult } from '$lib/export/apkg'
import type { ApkgExportRequest, ApkgExportResponse } from '$lib/export/apkg.worker'
import { shareOrDownload, timestampedName } from '$lib/export/download'
import { t } from '$lib/i18n'
import { errorMessage } from '../errors'

export class ApkgExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApkgExportError'
  }
}

/** Builds the package in a Web Worker (sql.js loaded on demand); media buffers are transferred. */
function buildInWorker(request: ApkgExportRequest): Promise<ApkgExportResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../export/apkg.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<ApkgExportResponse>) => {
      worker.terminate()
      const msg = event.data
      if (msg.type === 'done') resolve({ bytes: msg.bytes, report: msg.report })
      else reject(new ApkgExportError(msg.message))
    }
    worker.onerror = () => {
      worker.terminate()
      reject(new ApkgExportError('worker'))
    }
    worker.postMessage(
      request,
      request.input.media.map((m) => m.data.buffer),
    )
  })
}

/**
 * Anki export (05 §4): a deck with its sub-decks, a selection or everything, with scheduling,
 * history and media; the file `<prefix>-<date>.apkg` is shared or downloaded.
 */
export async function exportApkg(
  scope: ApkgExportScope,
  prefix: string,
  now: number,
): Promise<ApkgExportReport> {
  const { input, dayStartHour } = await gatherApkgExport(scope)
  const { bytes, report } = await buildInWorker({ input, options: { now, dayStartHour } })
  const blob = new Blob([bytes], { type: 'application/octet-stream' })
  await shareOrDownload(blob, timestampedName(prefix, 'apkg', now))
  return report
}

export function exportErrorMessage(e: unknown): string {
  if (!(e instanceof ApkgExportError)) return errorMessage(e)
  console.error(e)
  return t('exportApkg.failed')
}
