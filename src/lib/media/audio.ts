import { mediaUrl } from './url'

let current: HTMLAudioElement | null = null
let token = 0

/** Plays sounds one after the other; a new call interrupts the previous one. */
export async function playSounds(names: readonly string[]): Promise<void> {
  stopSounds()
  const mine = ++token
  for (const name of names) {
    const url = await mediaUrl(name)
    if (!url || mine !== token) continue
    const audio = new Audio(url)
    current = audio
    try {
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve()
        audio.onerror = () => resolve()
        audio.onpause = () => resolve()
        audio.play().catch(() => resolve())
      })
    } finally {
      if (current === audio) current = null
    }
    if (mine !== token) return
  }
}

export function stopSounds(): void {
  token++
  current?.pause()
  current = null
}
