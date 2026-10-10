import * as repo from '$lib/db/repo'
import { getSetting } from '$lib/db/settings'
import { clozeIndices } from '$lib/domain/cloze'
import { cardOrds, convertFields } from '$lib/domain/notes'
import { occlusionGroups, parseOcclusion } from '$lib/domain/occlusion'
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
  source = $state('')
  loaded = $state(false)
  /** Highest mask group of the note as loaded: a new mask never takes over an existing card. */
  loadedGroups = $state(0)

  readonly slots = $derived(slotsFor(this.modelType, this.noteType))
  readonly clozeMissing = $derived(
    this.modelType === 'cloze' && clozeIndices(this.fields[0] ?? '').length === 0,
  )
  readonly cardCount = $derived(cardOrds(this.modelType, this.fields, this.noteType).length)
  /** First group number a new mask may use (02 §2.1: a card's identity is its group). */
  readonly nextGroup = $derived(this.loadedGroups + 1)
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
      this.source = note.source ?? ''
      if (note.modelType === 'custom' && note.noteTypeId) {
        this.noteType = await repo.getNoteType(note.noteTypeId)
      }
      if (note.modelType === 'image_occlusion') {
        this.loadedGroups = Math.max(0, ...occlusionGroups(parseOcclusion(note.fields[1] ?? '')))
      }
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
      ...(this.source.trim() ? { source: this.source.trim() } : {}),
    }
  }

  /** Clears the submitted fields; text typed meanwhile (fast Ctrl+Entrée) is kept. */
  clear(submitted: readonly string[]): void {
    this.fields = this.fields.map((f, i) => (f === submitted[i] ? '' : f))
  }
}
