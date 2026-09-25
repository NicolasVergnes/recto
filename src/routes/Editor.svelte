<script lang="ts">
  import { live } from '$lib/db/live.svelte'
  import * as repo from '$lib/db/repo'
  import { setSetting } from '$lib/db/settings'
  import { requestPersistence, requestPersistenceOnce } from '$lib/db/storage'
  import { t } from '$lib/i18n'
  import { navigate, type RouteProps } from '$lib/router.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import CardPreview from '$lib/ui/editor/CardPreview.svelte'
  import { NoteDraft } from '$lib/ui/editor/draft.svelte'
  import FormActions from '$lib/ui/editor/FormActions.svelte'
  import MediaButtons from '$lib/ui/editor/MediaButtons.svelte'
  import MediaTray from '$lib/ui/editor/MediaTray.svelte'
  import NoteFields from '$lib/ui/editor/NoteFields.svelte'
  import NoteTypeRow from '$lib/ui/editor/NoteTypeRow.svelte'
  import TagInput from '$lib/ui/editor/TagInput.svelte'
  import { errorMessage } from '$lib/ui/errors'
  import OcclusionEditor from '$lib/ui/occlusion/OcclusionEditor.svelte'

  let { params, query }: RouteProps = $props()
  const editingId = $derived(params.id)

  const decks = live(() => repo.listDecks(), [])
  const knownTags = live(() => repo.allTags(), [])

  const draft = new NoteDraft()
  let noteFields: NoteFields | undefined = $state()
  let duplicate = $state(false)
  let busy = $state(false)
  let showPersistAsk = $state(false)
  const canSave = $derived(!busy && draft.complete)

  // Initial load: the note being edited, or the remembered/requested deck.
  $effect(() => {
    const id = editingId
    void draft.load(id, id ? undefined : query.deck)
  })

  // Fall back to the first deck when none is selected or the remembered one was deleted.
  $effect(() => {
    if (decks.loaded && draft.loaded && !decks.value.some((d) => d.id === draft.deckId)) {
      draft.deckId = decks.value[0]?.id ?? ''
    }
  })

  // Non-blocking duplicate warning (SPEC §5.2), debounced. Several occlusion notes on the same
  // image are legitimate (one per set of areas): no warning for them.
  $effect(() => {
    const front = draft.fields[0] ?? ''
    const deck = draft.deckId
    const except = editingId
    if (draft.modelType === 'image_occlusion') {
      duplicate = false
      return
    }
    const timer = setTimeout(() => {
      void repo.findDuplicate(deck, front, except).then((n) => (duplicate = !!n))
    }, 250)
    return () => clearTimeout(timer)
  })

  function makeCloze() {
    if (draft.modelType !== 'cloze' || !noteFields?.makeCloze()) toast(t('editor.clozeOnly'))
  }

  async function save(close: boolean) {
    if (!canSave) return
    busy = true
    const input = draft.input()
    try {
      if (editingId) {
        await repo.updateNote(editingId, input, Date.now())
        toast(t('editor.saved'))
        if (history.length > 1) history.back()
        else navigate(`/decks/${draft.deckId}`)
        return
      }
      const { cards } = await repo.createNote(input, Date.now())
      await setSetting('lastDeckId', draft.deckId)
      toast(t('editor.added', { n: cards.length }))
      if ((await requestPersistenceOnce()) === false) showPersistAsk = true
      if (close) navigate(`/decks/${draft.deckId}`)
      else {
        draft.clear(input.fields)
        duplicate = false
        noteFields?.reset()
      }
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
      makeCloze()
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
        <NoteTypeRow
          decks={decks.value}
          bind:deckId={draft.deckId}
          modelType={draft.modelType}
          editing={!!editingId}
          ontypechange={(next) => draft.changeType(next)}
        />

        {#if draft.modelType === 'image_occlusion'}
          <OcclusionEditor
            bind:image={() => draft.fields[0] ?? '', (v) => (draft.fields[0] = v)}
            bind:masks={() => draft.fields[1] ?? '', (v) => (draft.fields[1] = v)}
          />
        {/if}

        <NoteFields
          bind:this={noteFields}
          bind:fields={draft.fields}
          slots={draft.slots}
          {duplicate}
          clozeMissing={draft.clozeMissing}
        />

        <MediaButtons
          cloze={draft.modelType === 'cloze'}
          onfiles={(files) => noteFields?.addFiles(files)}
          onmakecloze={makeCloze}
        />
        <p class="muted small">{t('editor.mediaHelp')}</p>

        <MediaTray bind:fields={draft.fields} />

        <TagInput id="editor-tags" bind:value={draft.tagsText} known={knownTags.value} />
        <div class="field">
          <label for="editor-source">{t('editor.source')}</label>
          <input id="editor-source" type="text" bind:value={draft.source} />
        </div>

        {#if showPersistAsk}
          <div class="notice row spread" role="status">
            <span>{t('storage.persistAsk')}</span>
            <button class="btn btn-sm" type="button" onclick={askPersistence}>
              {t('storage.persistButton')}
            </button>
          </div>
        {/if}

        <FormActions editing={!!editingId} {canSave} onaddclose={() => save(true)} />
        <p class="muted small" aria-live="polite">
          {t('editor.willCreate', { n: draft.cardCount })}
        </p>
      </form>

      <CardPreview modelType={draft.modelType} fields={draft.fields} />
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
</style>
