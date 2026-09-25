<script lang="ts">
  import { tick } from 'svelte'
  import { live } from '$lib/db/live.svelte'
  import * as repo from '$lib/db/repo'
  import { getSetting, setSetting } from '$lib/db/settings'
  import { requestPersistence, requestPersistenceOnce } from '$lib/db/storage'
  import { clozeIndices, wrapCloze } from '$lib/domain/cloze'
  import { cardOrds, convertFields } from '$lib/domain/notes'
  import { atomicityWarnings, imageTag, insertAt, parseTags } from '$lib/domain/text'
  import type { ModelType } from '$lib/domain/types'
  import { t, type MessageKey } from '$lib/i18n'
  import { addMediaFile } from '$lib/media/store'
  import { mediaKind } from '$lib/media/mime'
  import { detectMime } from '$lib/media/store'
  import { navigate, type RouteProps } from '$lib/router.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import DeckSelect from '$lib/ui/DeckSelect.svelte'
  import AudioRecorder from '$lib/ui/editor/AudioRecorder.svelte'
  import CardPreview from '$lib/ui/editor/CardPreview.svelte'
  import FieldInput from '$lib/ui/editor/FieldInput.svelte'
  import MediaTray from '$lib/ui/editor/MediaTray.svelte'
  import TagInput from '$lib/ui/editor/TagInput.svelte'
  import { errorMessage } from '$lib/ui/errors'
  import Icon from '$lib/ui/Icon.svelte'

  let { params, query }: RouteProps = $props()
  const editingId = $derived(params.id)

  const decks = live(() => repo.listDecks(), [])
  const knownTags = live(() => repo.allTags(), [])

  let deckId = $state('')
  let modelType = $state<ModelType>('basic')
  let fields = $state<string[]>(['', '', ''])
  let tagsText = $state('')
  let source = $state('')
  let textareas = $state<(HTMLTextAreaElement | undefined)[]>([])
  let activeField = $state(0)
  let duplicate = $state(false)
  let busy = $state(false)
  let showPersistAsk = $state(false)
  let loaded = $state(false)
  let imageInput: HTMLInputElement | undefined = $state()
  let audioInput: HTMLInputElement | undefined = $state()

  const TYPES: { value: ModelType; label: MessageKey }[] = [
    { value: 'basic', label: 'editor.basic' },
    { value: 'basic_reverse', label: 'editor.basicReverse' },
    { value: 'cloze', label: 'editor.cloze' },
  ]
  const labels = $derived<MessageKey[]>(
    modelType === 'cloze'
      ? ['editor.text', 'editor.extra']
      : ['editor.front', 'editor.back', 'editor.extra'],
  )
  const clozeMissing = $derived(modelType === 'cloze' && clozeIndices(fields[0] ?? '').length === 0)
  const cardCount = $derived(cardOrds(modelType, fields).length)
  const canSave = $derived(
    !busy && !!deckId && (fields[0] ?? '').trim() !== '' && !clozeMissing && loaded,
  )

  // Initial load: the note being edited, or the remembered/requested deck.
  $effect(() => {
    const id = editingId
    void (async () => {
      if (id) {
        const note = await repo.getNote(id)
        if (!note) {
          toast(t('errors.noteNotFound'), 'error')
          navigate('/cards')
          return
        }
        deckId = note.deckId
        modelType = note.modelType
        fields = [...note.fields]
        tagsText = note.tags.join(' ')
        source = note.source ?? ''
      } else {
        deckId = query.deck ?? (await getSetting('lastDeckId')) ?? ''
      }
      loaded = true
    })()
  })

  // Fall back to the first deck when none is selected or the remembered one was deleted.
  $effect(() => {
    if (decks.loaded && loaded && !decks.value.some((d) => d.id === deckId)) {
      deckId = decks.value[0]?.id ?? ''
    }
  })

  // Non-blocking duplicate warning (SPEC §5.2), debounced.
  $effect(() => {
    const front = fields[0] ?? ''
    const deck = deckId
    const except = editingId
    const timer = setTimeout(() => {
      void repo.findDuplicate(deck, front, except).then((n) => (duplicate = !!n))
    }, 250)
    return () => clearTimeout(timer)
  })

  function changeType(next: ModelType) {
    fields = convertFields(modelType, next, fields)
    modelType = next
  }

  async function insertIntoActive(snippet: string) {
    const i = Math.min(activeField, fields.length - 1)
    const el = textareas[i]
    const text = fields[i] ?? ''
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const r = insertAt(text, start, end, snippet)
    fields[i] = r.text
    await tick()
    el?.focus()
    el?.setSelectionRange(r.caret, r.caret)
  }

  async function addFiles(files: readonly File[]) {
    for (const file of files) {
      try {
        const kind = mediaKind(detectMime(file, file.name))
        const media = await addMediaFile(file, file.name, Date.now())
        await insertIntoActive(kind === 'audio' ? `[sound:${media.name}]` : imageTag(media.name))
      } catch (e) {
        toast(errorMessage(e), 'error')
      }
    }
  }

  function pick(input: HTMLInputElement | undefined) {
    input?.click()
  }

  async function onPicked(e: Event & { currentTarget: HTMLInputElement }) {
    const files = e.currentTarget.files ? Array.from(e.currentTarget.files) : []
    e.currentTarget.value = ''
    await addFiles(files)
  }

  async function makeCloze() {
    if (modelType !== 'cloze' || activeField !== 0) {
      toast(t('editor.clozeOnly'))
      return
    }
    const el = textareas[0]
    const text = fields[0] ?? ''
    const r = wrapCloze(text, el?.selectionStart ?? text.length, el?.selectionEnd ?? text.length)
    fields[0] = r.text
    await tick()
    el?.focus()
    el?.setSelectionRange(r.caret, r.caret)
  }

  function resetForm() {
    fields = fields.map(() => '')
    duplicate = false
    activeField = 0
    void tick().then(() => textareas[0]?.focus())
  }

  async function save(close: boolean) {
    if (!canSave) return
    busy = true
    const input = {
      deckId,
      modelType,
      fields: [...fields],
      tags: parseTags(tagsText),
      ...(source.trim() ? { source: source.trim() } : {}),
    }
    try {
      if (editingId) {
        await repo.updateNote(editingId, input, Date.now())
        toast(t('editor.saved'))
        if (history.length > 1) history.back()
        else navigate(`/decks/${deckId}`)
        return
      }
      const { cards } = await repo.createNote(input, Date.now())
      await setSetting('lastDeckId', deckId)
      toast(t('editor.added', { n: cards.length }))
      if ((await requestPersistenceOnce()) === false) showPersistAsk = true
      if (close) navigate(`/decks/${deckId}`)
      else resetForm()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      busy = false
    }
  }

  async function askPersistence() {
    showPersistAsk = !(await requestPersistence())
  }

  function onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void save(false)
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      void makeCloze()
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section class="page page-wide editor">
  <h1 tabindex="-1">{t(editingId ? 'editor.titleEdit' : 'editor.titleNew')}</h1>

  {#if decks.loaded && decks.value.length === 0}
    <p class="notice">{t('editor.noDeck')} <a href="#/">{t('home.createDeck')}</a></p>
  {:else}
    <div class="layout">
      <form
        class="stack"
        onsubmit={(e) => {
          e.preventDefault()
          void save(false)
        }}
      >
        <div class="row">
          <div class="field grow">
            <label for="editor-deck">{t('editor.deck')}</label>
            <DeckSelect id="editor-deck" decks={decks.value} bind:value={deckId} />
          </div>
          <div class="field grow">
            <label for="editor-type">{t('editor.type')}</label>
            <select
              id="editor-type"
              value={modelType}
              disabled={!!editingId && modelType === 'cloze'}
              onchange={(e) => {
                const v = TYPES.find((x) => x.value === e.currentTarget.value)
                if (v) changeType(v.value)
              }}
            >
              {#each TYPES as type (type.value)}
                <option value={type.value} disabled={!!editingId && type.value === 'cloze'}>
                  {t(type.label)}
                </option>
              {/each}
            </select>
          </div>
        </div>

        {#each labels as label, i (label)}
          <FieldInput
            id={`field-${i}`}
            label={t(label)}
            bind:value={() => fields[i] ?? '', (v) => (fields[i] = v)}
            bind:textarea={textareas[i]}
            rows={i === 0 ? 3 : 2}
            warnings={label === 'editor.extra' ? [] : atomicityWarnings(fields[i] ?? '')}
            onfocus={() => (activeField = i)}
            onfiles={addFiles}
          />
          {#if i === 0}
            {#if duplicate}<p class="warning-text" role="status">{t('editor.duplicate')}</p>{/if}
            {#if clozeMissing}
              <p class="muted small">{t('editor.clozeHelp')}</p>
            {/if}
          {/if}
        {/each}

        <div class="row" role="group" aria-label={t('editor.media')}>
          <button class="btn btn-sm" type="button" onclick={() => pick(imageInput)}>
            <Icon name="image" />
            {t('editor.image')}
          </button>
          <button class="btn btn-sm" type="button" onclick={() => pick(audioInput)}>
            <Icon name="volume" />
            {t('editor.audio')}
          </button>
          <AudioRecorder onrecorded={(file) => addFiles([file])} />
          {#if modelType === 'cloze'}
            <button class="btn btn-sm" type="button" onclick={makeCloze}>
              {t('editor.makeCloze')}
            </button>
          {/if}
          <input
            bind:this={imageInput}
            class="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            multiple
            tabindex="-1"
            aria-hidden="true"
            onchange={onPicked}
          />
          <input
            bind:this={audioInput}
            class="visually-hidden"
            type="file"
            accept="audio/*"
            multiple
            tabindex="-1"
            aria-hidden="true"
            onchange={onPicked}
          />
        </div>
        <p class="muted small">{t('editor.mediaHelp')}</p>

        <MediaTray bind:fields />

        <TagInput id="editor-tags" bind:value={tagsText} known={knownTags.value} />
        <div class="field">
          <label for="editor-source">{t('editor.source')}</label>
          <input id="editor-source" type="text" bind:value={source} />
        </div>

        {#if showPersistAsk}
          <div class="notice row spread" role="status">
            <span>{t('storage.persistAsk')}</span>
            <button class="btn btn-sm" type="button" onclick={askPersistence}>
              {t('storage.persistButton')}
            </button>
          </div>
        {/if}

        <div class="row actions">
          {#if editingId}
            <button class="btn btn-primary" type="submit" disabled={!canSave}>
              {t('common.save')}
            </button>
            <button class="btn" type="button" onclick={() => history.back()}>
              {t('common.cancel')}
            </button>
          {:else}
            <button class="btn btn-primary" type="submit" disabled={!canSave}>
              {t('editor.add')}
            </button>
            <button class="btn" type="button" disabled={!canSave} onclick={() => save(true)}>
              {t('editor.addClose')}
            </button>
          {/if}
          <span class="muted small">{t('editor.shortcuts')}</span>
        </div>
        <p class="muted small" aria-live="polite">{t('editor.willCreate', { n: cardCount })}</p>
      </form>

      <CardPreview {modelType} {fields} />
    </div>
  {/if}
</section>

<style>
  .layout {
    display: grid;
    gap: var(--space-6);
  }

  @media (min-width: 1100px) {
    .layout {
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      align-items: start;
    }
  }

  .grow {
    flex: 1;
    min-width: 12rem;
  }

  .actions {
    margin-top: var(--space-2);
  }
</style>
