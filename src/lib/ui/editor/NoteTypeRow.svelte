<script lang="ts">
  import type { Deck, ModelType, NoteType } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import { href } from '$lib/router.svelte'
  import DeckSelect from '$lib/ui/DeckSelect.svelte'
  import { BASIC_KINDS } from '$lib/ui/model-labels'

  interface Props {
    decks: readonly Deck[]
    deckId: string
    /** basic notes in a deck that asks both sides: always asked front → back. */
    oneWay: boolean
    /** cloze and occlusion notes: one card for every index or group (M14). */
    single: boolean
    modelType: ModelType
    noteType: NoteType | undefined
    noteTypes: readonly NoteType[]
    /** An existing note keeps its type and, for a Basique note, its kind of card. */
    editing: boolean
    ontypechange: (next: ModelType, noteType?: NoteType) => void
  }
  let {
    decks,
    deckId = $bindable(),
    oneWay = $bindable(),
    single = $bindable(),
    modelType,
    noteType,
    noteTypes,
    editing,
    ontypechange,
  }: Props = $props()

  // M14: the built-in note types are one, Basique, whose card is classic, cloze or occlusion.
  const value = $derived(modelType === 'custom' ? `custom:${noteType?.id ?? ''}` : 'basic')
  const bothWays = $derived(
    modelType === 'basic' && !!decks.find((d) => d.id === deckId)?.settings.alternateSides,
  )

  function change(next: string) {
    const custom = noteTypes.find((nt) => `custom:${nt.id}` === next)
    if (custom) ontypechange('custom', custom)
    else if (next === 'basic') ontypechange('basic')
  }

  function changeKind(next: string) {
    const kind = BASIC_KINDS.find((k) => k.value === next)
    if (kind) ontypechange(kind.value)
  }
</script>

<div class="row">
  <div class="field grow">
    <label for="editor-deck">{t('editor.deck')}</label>
    <DeckSelect id="editor-deck" {decks} bind:value={deckId} />
  </div>
  <div class="field grow">
    <label for="editor-type">{t('editor.type')}</label>
    <select
      id="editor-type"
      {value}
      disabled={editing}
      onchange={(e) => change(e.currentTarget.value)}
    >
      <option value="basic">{t('editor.basic')}</option>
      {#if noteTypes.length > 0}
        <optgroup label={t('editor.customTypes')}>
          {#each noteTypes as nt (nt.id)}
            <option value={`custom:${nt.id}`}>{nt.name}</option>
          {/each}
        </optgroup>
      {/if}
    </select>
    <a class="small" href={href('/note-types')}>{t('editor.manageTypes')}</a>
  </div>
  {#if modelType !== 'custom'}
    <div class="field grow">
      <label for="editor-kind">{t('editor.cardKind')}</label>
      <select
        id="editor-kind"
        value={modelType}
        disabled={editing}
        onchange={(e) => changeKind(e.currentTarget.value)}
      >
        {#each BASIC_KINDS as kind (kind.value)}
          <option value={kind.value}>{t(kind.label)}</option>
        {/each}
      </select>
    </div>
  {/if}
</div>
{#if modelType === 'cloze' || modelType === 'image_occlusion'}
  <div>
    <label class="check">
      <input type="checkbox" bind:checked={single} aria-describedby="editor-single-help" />
      {t('editor.single')}
    </label>
    <p id="editor-single-help" class="muted small">
      {t(modelType === 'cloze' ? 'editor.singleClozeHelp' : 'editor.singleOcclusionHelp')}
    </p>
  </div>
{/if}
{#if bothWays}
  <div>
    <label class="check">
      <input type="checkbox" bind:checked={oneWay} aria-describedby="editor-one-way-help" />
      {t('editor.oneWay')}
    </label>
    <p id="editor-one-way-help" class="muted small">{t('editor.oneWayHelp')}</p>
  </div>
{/if}

<style>
  .grow {
    flex: 1;
    min-width: 12rem;
  }
</style>
