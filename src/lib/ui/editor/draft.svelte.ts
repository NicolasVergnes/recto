import * as repo from '$lib/db/repo'
import { getSetting } from '$lib/db/settings'
import { clozeIndices } from '$lib/domain/cloze'
import { cardOrds, convertFields, type NoteContent } from '$lib/domain/notes'
import { occlusionGroups, parseOcclusion } from '$lib/domain/occlusion'
import { sourceFields } from '$lib/domain/templates'
import { imageRefs, parseTags } from '$lib/domain/text'
import type { ModelType, NoteType } from '$lib/domain/types'
import { t } from '$lib/i18n'
import { navigate } from '$lib/router.svelte'
import { toast } from '$lib/state/toast.svelte'
import { slotsFor } from './slots'

/** The note being written in the editor (new or existing) and what it will produce. */
export class NoteDraft {
  deckId = $state('')
  modelType = $state<ModelType>('basic')
  /** custom notes: their note type. */
  noteType = $state.raw<NoteType>()
  fields = $state<string[]>(['', '', ''])
  tagsText = $state('')
  /** basic notes: never asked back → front, even in a deck that alternates. */
  oneWay = $state(false)
  /** cloze and occlusion notes: one card for every index or group (M14). */
  single = $state(false)
  /** custom notes: masks of the image fields of their occlusion cards, aligned with `fields`. */
  masks = $state<string[]>([])
  source = $state('')
  loaded = $state(false)
  /**
   * Highest mask group of each image field as loaded (the image field: 0 for an occlusion note):
   * a new mask never takes over an existing card.
   */
  loadedGroups = $state<number[]>([])

  readonly slots = $derived(slotsFor(this.modelType, this.noteType))
  readonly clozeMissing = $derived(
    this.modelType === 'cloze' && clozeIndices(this.fields[0] ?? '').length === 0,
  )
  /** Fields holding a cloze text: the text of a cloze note, the sources of a type's cloze cards. */
  readonly clozeFields = $derived(
    this.modelType === 'cloze'
      ? [0]
      : this.modelType === 'custom' && this.noteType
        ? sourceFields(this.noteType, 'cloze')
        : [],
  )
  /** custom notes: the image fields of their occlusion cards (M14). */
  readonly imageFields = $derived(
    this.modelType === 'custom' && this.noteType ? sourceFields(this.noteType, 'occlusion') : [],
  )
  /** What generates the cards (preview and count). */
  readonly content: NoteContent = $derived({
    modelType: this.modelType,
    fields: this.fields,
    single: this.single,
    masks: this.masks,
  })
  readonly cardCount = $derived(cardOrds(this.content, this.noteType).length)

  /** First group number a new mask of image field `i` may use (02 §2.1: a card is its group). */
  nextGroup(i: number): number {
    return (this.loadedGroups[i] ?? 0) + 1
  }
  /**
   * A deck, a front, cloze markers for a cloze note (an image and a mask for an occlusion
   * note, a card for a custom note), and the initial load done.
   */
  readonly complete = $derived(
    !!this.deckId &&
      this.loaded &&
      (this.modelType === 'image_occlusion'
        ? imageRefs(this.fields[0] ?? '').length > 0 && this.cardCount > 0
        : this.modelType === 'custom'
          ? this.cardCount > 0
          : (this.fields[0] ?? '').trim() !== '' && !this.clozeMissing),
  )

  /** Loads the note being edited, or selects the requested or remembered deck. */
  async load(id: string | undefined, requestedDeck: string | undefined): Promise<void> {
    if (id) {
      const note = await repo.getNote(id)
      if (!note) {
        toast(t('errors.noteNotFound'), 'error')
        navigate('/cards')
        return
      }
      this.deckId = note.deckId
      this.modelType = note.modelType
      this.fields = [...note.fields]
      this.tagsText = note.tags.join(' ')
      this.oneWay = note.oneWay === true
      this.single = note.single === true
      this.masks = [...(note.masks ?? [])]
      this.source = note.source ?? ''
      if (note.modelType === 'custom' && note.noteTypeId) {
        this.noteType = await repo.getNoteType(note.noteTypeId)
      }
      const highest = (json: string) => Math.max(0, ...occlusionGroups(parseOcclusion(json)))
      this.loadedGroups =
        note.modelType === 'image_occlusion'
          ? [highest(note.fields[1] ?? '')]
          : this.masks.map(highest)
    } else {
      this.deckId = requestedDeck ?? (await getSetting('lastDeckId')) ?? ''
    }
    this.loaded = true
  }

  /** Converts the fields to another note type (front and extra are kept, see convertFields). */
  changeType(next: ModelType, noteType?: NoteType): void {
    this.fields = convertFields(this.modelType, next, this.fields, noteType)
    this.modelType = next
    this.noteType = next === 'custom' ? noteType : undefined
    this.masks = []
  }

  /** Plain copy for the repository (no reactive proxies in IndexedDB). */
  input(): repo.NoteInput {
    return {
      deckId: this.deckId,
      modelType: this.modelType,
      ...(this.modelType === 'custom' && this.noteType ? { noteTypeId: this.noteType.id } : {}),
      fields: [...this.fields],
      tags: parseTags(this.tagsText),
      ...(this.modelType === 'basic' && this.oneWay ? { oneWay: true } : {}),
      ...(this.single && (this.modelType === 'cloze' || this.modelType === 'image_occlusion')
        ? { single: true }
        : {}),
      ...(this.modelType === 'custom' && this.masks.some((m) => m)
        ? { masks: this.fields.map((_, i) => this.masks[i] ?? '') }
        : {}),
      ...(this.source.trim() ? { source: this.source.trim() } : {}),
    }
  }

  /**
   * Clears the submitted fields, and the masks of a cleared image; text typed meanwhile (fast
   * Ctrl+Entrée) is kept.
   */
  clear(submitted: readonly string[]): void {
    this.fields = this.fields.map((f, i) => (f === submitted[i] ? '' : f))
    this.masks = this.masks.map((m, i) => (this.fields[i] ? m : ''))
  }
}
