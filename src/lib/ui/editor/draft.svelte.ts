import * as repo from '$lib/db/repo'
import { getSetting } from '$lib/db/settings'
import { clozeIndices } from '$lib/domain/cloze'
import { cardOrds, convertFields } from '$lib/domain/notes'
import { imageRefs, parseTags } from '$lib/domain/text'
import type { ModelType } from '$lib/domain/types'
import { t } from '$lib/i18n'
import { navigate } from '$lib/router.svelte'
import { toast } from '$lib/state/toast.svelte'
import { SLOTS } from './slots'

/** The note being written in the editor (new or existing) and what it will produce. */
export class NoteDraft {
  deckId = $state('')
  modelType = $state<ModelType>('basic')
  fields = $state<string[]>(['', '', ''])
  tagsText = $state('')
  source = $state('')
  loaded = $state(false)

  readonly slots = $derived(SLOTS[this.modelType])
  readonly clozeMissing = $derived(
    this.modelType === 'cloze' && clozeIndices(this.fields[0] ?? '').length === 0,
  )
  readonly cardCount = $derived(cardOrds(this.modelType, this.fields).length)
  /**
   * A deck, a front, cloze markers for a cloze note (an image and a mask for an occlusion
   * note), and the initial load done.
   */
  readonly complete = $derived(
    !!this.deckId &&
      this.loaded &&
      (this.modelType === 'image_occlusion'
        ? imageRefs(this.fields[0] ?? '').length > 0 && this.cardCount > 0
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
      this.source = note.source ?? ''
    } else {
      this.deckId = requestedDeck ?? (await getSetting('lastDeckId')) ?? ''
    }
    this.loaded = true
  }

  /** Converts the fields to another note type (front and extra are kept, see convertFields). */
  changeType(next: ModelType): void {
    this.fields = convertFields(this.modelType, next, this.fields)
    this.modelType = next
  }

  /** Plain copy for the repository (no reactive proxies in IndexedDB). */
  input(): repo.NoteInput {
    return {
      deckId: this.deckId,
      modelType: this.modelType,
      fields: [...this.fields],
      tags: parseTags(this.tagsText),
      ...(this.source.trim() ? { source: this.source.trim() } : {}),
    }
  }

  /** Clears the submitted fields; text typed meanwhile (fast Ctrl+Entrée) is kept. */
  clear(submitted: readonly string[]): void {
    this.fields = this.fields.map((f, i) => (f === submitted[i] ? '' : f))
  }
}
