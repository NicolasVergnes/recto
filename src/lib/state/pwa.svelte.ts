import { registerSW } from 'virtual:pwa-register'

/** Service worker lifecycle (06 §1): the update is applied only when the user asks. */
export const pwa = $state({ needRefresh: false, offlineReady: false })

let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined

export function initPwa(): void {
  updateSW = registerSW({
    onNeedRefresh() {
      pwa.needRefresh = true
    },
    onOfflineReady() {
      pwa.offlineReady = true
    },
  })
}

export function applyUpdate(): void {
  void updateSW?.(true)
}
