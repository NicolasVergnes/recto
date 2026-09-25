/** Triggers a file download (works in the installed PWA, 05 §3). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Offers the native share sheet when files can be shared (mobile), else downloads. */
export async function shareOrDownload(
  blob: Blob,
  filename: string,
): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared'
    }
  }
  downloadBlob(blob, filename)
  return 'downloaded'
}

/** `recto-sauvegarde-2026-09-25-1430.recto.zip` (local time). */
export function timestampedName(prefix: string, extension: string, now: number): string {
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
  return `${prefix}-${stamp}.${extension}`
}
