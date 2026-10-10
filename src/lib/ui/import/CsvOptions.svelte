<script lang="ts" module>
  /** Value of the deck select that creates a new deck. */
  export const NEW_DECK = '__new__'
</script>

<script lang="ts">
  import { deckOptions } from '$lib/domain/decks'
  import type { Deck, NoteType } from '$lib/domain/types'
  import type { DuplicateStrategy } from '$lib/import/csv'
  import { t, type MessageKey } from '$lib/i18n'

  interface Props {
    id: string
    /** A built-in model type, or `custom:<note type id>` (M10). */
    typeChoice: string
    noteTypes: readonly NoteType[]
    decks: readonly Deck[]
    deckId: string
    newDeckName: string
    duplicates: DuplicateStrategy
    /** The chosen type, when custom: duplicates and updates are worded for its fields. */
    custom: NoteType | undefined
    ontype: (choice: string) => void
  }
  let {
    id,
    typeChoice,
    noteTypes,
    decks,
    deckId = $bindable(),
    newDeckName = $bindable(),
    duplicates = $bindable(),
    custom,
    ontype,
  }: Props = $props()

  const TYPES: { value: string; label: MessageKey }[] = [
    { value: 'basic', label: 'editor.basic' },
    { value: 'basic_reverse', label: 'editor.basicReverse' },
    { value: 'cloze', label: 'editor.cloze' },
  ]
  const STRATEGIES: { value: DuplicateStrategy; label: MessageKey }[] = $derived([
    { value: 'skip', label: 'csv.dupSkip' },
    { value: 'update', label: custom ? 'csv.dupUpdateCustom' : 'csv.dupUpdate' },
    { value: 'duplicate', label: 'csv.dupDuplicate' },
  ])
</script>

<div class="grid">
  <div class="field">
    <label for={`${id}-type`}>{t('editor.type')}</label>
    <select id={`${id}-type`} value={typeChoice} onchange={(e) => ontype(e.currentTarget.value)}>
      {#each TYPES as type (type.value)}<option value={type.value}>{t(type.label)}</option>{/each}
      {#if noteTypes.length > 0}
        <optgroup label={t('editor.customTypes')}>
          {#each noteTypes as type (type.id)}<option value={`custom:${type.id}`}>{type.name}</option
            >{/each}
        </optgroup>
      {/if}
    </select>
  </div>
  <div class="field">
    <label for={`${id}-deck`}>{t('csv.target')}</label>
    <select id={`${id}-deck`} bind:value={deckId}>
      <option value={NEW_DECK}>{t('csv.newDeck')}</option>
      {#if decks.length > 0}
        <optgroup label={t('home.decks')}>
          {#each deckOptions(decks) as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
        </optgroup>
      {/if}
    </select>
  </div>
  {#if deckId === NEW_DECK}
    <div class="field">
      <label for={`${id}-name`}>{t('deck.name')}</label>
      <input id={`${id}-name`} type="text" bind:value={newDeckName} />
    </div>
  {/if}
</div>
<p class="muted small">{t('csv.deckColumnHelp')}</p>

<fieldset>
  <legend>
    {custom ? t('csv.duplicatesCustom', { field: custom.fields[0] ?? '' }) : t('csv.duplicates')}
  </legend>
  {#each STRATEGIES as s (s.value)}
    <label class="check">
      <input type="radio" name={`${id}-dup`} value={s.value} bind:group={duplicates} />
      {t(s.label)}
    </label>
  {/each}
</fieldset>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: var(--space-3);
  }

  fieldset {
    border: none;
    margin: 0;
    padding: 0;
  }

  legend {
    font-weight: 600;
    font-size: 0.9rem;
  }
</style>
