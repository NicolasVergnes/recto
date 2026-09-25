/** Short, polite status messages (aria-live), e.g. "Note ajoutée". */
export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
}

export const toasts = $state<Toast[]>([])
let next = 1

const MAX_VISIBLE = 3

export function toast(text: string, kind: Toast['kind'] = 'info', ms = 4000): void {
  const id = next++
  toasts.push({ id, text, kind })
  if (toasts.length > MAX_VISIBLE) toasts.splice(0, toasts.length - MAX_VISIBLE)
  setTimeout(() => dismissToast(id), ms)
}

export function dismissToast(id: number): void {
  const i = toasts.findIndex((t) => t.id === id)
  if (i !== -1) toasts.splice(i, 1)
}
