/** One modal confirmation at a time, awaited by callers: `if (await confirmAction({...}))`. */
export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
}

interface Pending extends ConfirmRequest {
  resolve: (ok: boolean) => void
}

export const confirmState = $state<{ current: Pending | null }>({ current: null })

export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  confirmState.current?.resolve(false)
  return new Promise((resolve) => {
    confirmState.current = { ...request, resolve }
  })
}

export function settleConfirm(ok: boolean): void {
  const pending = confirmState.current
  confirmState.current = null
  pending?.resolve(ok)
}
