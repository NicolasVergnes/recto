import { liveQuery } from 'dexie'

/**
 * Reactive Dexie read for components (svelte5-conventions §2). Must be called during component
 * initialisation. Reactive values read synchronously by `query` (before its first `await`) are
 * tracked: the query re-subscribes when they change.
 */
export function live<T>(query: () => Promise<T>, initial: T) {
  let value = $state.raw(initial)
  let loaded = $state(false)
  let error = $state<unknown>(null)
  $effect(() => {
    const sub = liveQuery(query).subscribe({
      next: (v) => {
        value = v
        loaded = true
        error = null
      },
      error: (e: unknown) => {
        error = e
        loaded = true
      },
    })
    return () => sub.unsubscribe()
  })
  return {
    get value() {
      return value
    },
    get loaded() {
      return loaded
    },
    get error() {
      return error
    },
  }
}
