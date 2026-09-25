// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { RepoError } from '$lib/db/errors'
import * as repo from '$lib/db/repo'
import { sha256Hex } from '$lib/media/hash'
import {
  baseMime,
  extensionFor,
  fitWithin,
  mediaFileName,
  mediaKind,
  mimeFromName,
  slugify,
} from '$lib/media/mime'
import {
  addMediaFile,
  deleteMedia,
  detectMime,
  findMissingMedia,
  findOrphanMedia,
  getMedia,
  type Resizer,
} from '$lib/media/store'
import { cachedUrlCount, clearMediaUrls, forgetMediaUrl, mediaUrl } from '$lib/media/url'
import { useTestDatabase } from '../helpers/db'

useTestDatabase()
const T0 = Date.UTC(2026, 8, 25)

const shrink: Resizer = async (blob) => ({
  blob: new Blob([new Uint8Array(Math.floor(blob.size / 4))], { type: 'image/webp' }),
  width: 1280,
  height: 960,
  resized: true,
})

describe('media helpers', () => {
  it('whitelists MIME types', () => {
    expect(mediaKind('image/png')).toBe('image')
    expect(mediaKind('audio/webm;codecs=opus')).toBe('audio')
    expect(mediaKind('application/pdf')).toBeNull()
    expect(mediaKind('image/bmp')).toBeNull()
    expect(baseMime(' Audio/OGG ; x=1')).toBe('audio/ogg')
    expect(mimeFromName('Son.MP3')).toBe('audio/mpeg')
    expect(mimeFromName('noext')).toBeNull()
    expect(extensionFor('image/jpeg')).toBe('jpg')
    expect(extensionFor('text/plain')).toBe('bin')
    expect(detectMime(new Blob([]), 'a.png')).toBe('image/png')
  })

  it('computes the resize target (4000 px → 1280 px, never upscaling)', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 })
    expect(fitWithin(3000, 4000)).toEqual({ width: 960, height: 1280 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('builds unique, safe file names', () => {
    expect(slugify('Drapeau de la France (2).PNG')).toBe('drapeau-de-la-france-2')
    expect(slugify('???.png')).toBe('media')
    expect(slugify('.hidden')).toBe('hidden')
    expect(mediaFileName('Été à Paris.jpeg', 'a1b2c3d4e5', 'image/webp')).toBe(
      'a1b2c3d4-ete-a-paris.webp',
    )
  })

  it('computes sha256', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await sha256Hex(new Blob(['abc']))).toBe(
      await sha256Hex(new TextEncoder().encode('abc').buffer),
    )
  })
})

describe('media storage', () => {
  it('resizes images and deduplicates by content', async () => {
    const file = new Blob([new Uint8Array(40_000).fill(7)], { type: 'image/png' })
    const media = await addMediaFile(file, 'Carte.png', T0, shrink)
    expect(media).toMatchObject({ mime: 'image/webp', size: 10_000, createdAt: T0 })
    expect(media.name).toMatch(/^[0-9a-f]{8}-carte\.webp$/)
    const again = await addMediaFile(file, 'Autre nom.png', T0 + 1, shrink)
    expect(again.name).toBe(media.name)
    const stored = await getMedia(media.name)
    expect(stored?.size).toBe(10_000)
    expect(await sha256Hex(stored?.blob ?? new Blob())).toBe(media.sha256)
  })

  it('keeps a small original when re-encoding does not help', async () => {
    const file = new Blob([new Uint8Array(100).fill(1)], { type: 'image/jpeg' })
    const bigger: Resizer = async () => ({
      blob: new Blob([new Uint8Array(500)], { type: 'image/webp' }),
      width: 10,
      height: 10,
      resized: false,
    })
    const media = await addMediaFile(file, 'petit.jpg', T0, bigger)
    expect(media.mime).toBe('image/jpeg')
    expect(media.size).toBe(100)
  })

  it('refuses unsupported, unreadable and oversized files', async () => {
    const code = (e: unknown) => (e instanceof RepoError ? e.code : 'other')
    await expect(
      addMediaFile(new Blob(['x'], { type: 'application/pdf' }), 'a.pdf', T0),
    ).rejects.toSatisfy((e) => code(e) === 'mediaType')
    const broken: Resizer = () => Promise.reject(new Error('decode'))
    await expect(
      addMediaFile(new Blob(['x'], { type: 'image/png' }), 'a.png', T0, broken),
    ).rejects.toSatisfy((e) => code(e) === 'mediaUnreadable')
    const hugeGif = new Blob([new Uint8Array(700 * 1024)], { type: 'image/gif' })
    await expect(addMediaFile(hugeGif, 'a.gif', T0)).rejects.toSatisfy(
      (e) => code(e) === 'mediaTooLarge',
    )
    const hugeAudio = new Blob([new Uint8Array(3 * 1024 * 1024 + 1)], { type: 'audio/mpeg' })
    await expect(addMediaFile(hugeAudio, 'a.mp3', T0)).rejects.toSatisfy(
      (e) => code(e) === 'mediaTooLarge',
    )
  })

  it('stores audio as is and sanitises SVG', async () => {
    const audio = await addMediaFile(
      new Blob(['ID3...'], { type: 'audio/webm;codecs=opus' }),
      'rec.webm',
      T0,
    )
    expect(audio).toMatchObject({ mime: 'audio/webm', size: 6 })
    const svg = await addMediaFile(
      new Blob(
        [
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="1" height="1"/></svg>',
        ],
        {
          type: 'image/svg+xml',
        },
      ),
      'logo.svg',
      T0,
    )
    const text = await (await getMedia(svg.name))?.blob.text()
    expect(text).toContain('<rect')
    expect(text).not.toContain('script')
  })

  it('lists orphan and missing media', async () => {
    const used = await addMediaFile(new Blob(['a'], { type: 'audio/mpeg' }), 'used.mp3', T0)
    const orphan = await addMediaFile(new Blob(['b'], { type: 'audio/mpeg' }), 'orphan.mp3', T0)
    const deck = await repo.createDeck({ name: 'D' }, T0)
    await repo.createNote(
      {
        deckId: deck.id,
        modelType: 'basic',
        fields: [`Q [sound:${used.name}]`, '<img src="absent.png">'],
        tags: [],
      },
      T0,
    )
    expect(await findOrphanMedia()).toEqual([orphan.name])
    expect(await findMissingMedia()).toEqual(['absent.png'])
    await deleteMedia([orphan.name])
    expect(await findOrphanMedia()).toEqual([])
  })
})

describe('media object URLs', () => {
  it('caches up to 50 URLs and revokes evicted ones', async () => {
    const create = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(() => `blob:${crypto.randomUUID()}`)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const names: string[] = []
    for (let i = 0; i < 52; i++) {
      const m = await addMediaFile(new Blob([`s${i}`], { type: 'audio/mpeg' }), `s${i}.mp3`, T0)
      names.push(m.name)
    }
    const first = await mediaUrl(names[0] ?? '')
    expect(first).toMatch(/^blob:/)
    expect(await mediaUrl(names[0] ?? '')).toBe(first)
    for (const name of names.slice(1)) await mediaUrl(name)
    expect(cachedUrlCount()).toBe(50)
    expect(revoke).toHaveBeenCalledTimes(2)
    expect(await mediaUrl('missing.png')).toBeNull()
    forgetMediaUrl(names[51] ?? '')
    expect(cachedUrlCount()).toBe(49)
    clearMediaUrls()
    expect(cachedUrlCount()).toBe(0)
    expect(create).toHaveBeenCalledTimes(52)
    create.mockRestore()
    revoke.mockRestore()
  })
})
