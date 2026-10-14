<script lang="ts" module>
  import type { StatusFilter } from '$lib/domain/browse'
  import type { MessageKey } from '$lib/i18n'

  /** The status filter's choices (also read from the URL by the page). */
  export const STATUSES: { value: StatusFilter; label: MessageKey }[] = [
    { value: '', label: 'browser.allStates' },
    { value: 'new', label: 'states.new' },
    { value: 'learning', label: 'states.learning' },
    { value: 'review', label: 'states.review' },
    { value: 'relearning', label: 'states.relearning' },
    { value: 'suspended', label: 'states.suspended' },
    { value: 'retired', label: 'states.retired' },
    { value: 'flagged', label: 'browser.flagged' },
  ]
</script>

<script lang="ts">
  import type { FormatName } from '$lib/domain/formats'
  import type { Deck } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import DeckSelect from '../DeckSelect.svelte'
  import { formatLabel } from '../format-labels'

  interface Props {
    decks: readonly Deck[]
    tags: readonly string[]
    /** Formats present among the cards (M17). */
    formats: readonly FormatName[]
    q: string
    deck: string
    tag: string
    status: StatusFilter
    format: string
  }
  let {
    decks,
    tags,
    formats,
    q = $bindable(),
    deck = $bindable(),
    tag = $bindable(),
    status = $bindable(),
    format = $bindable(),
  }: Props = $props()
</script>

<form class="filters" role="search" onsubmit={(e) => e.preventDefault()}>
  <div class="field">
    <label for="f-q">{t('common.search')}</label>
    <input id="f-q" type="search" bind:value={q} placeholder={t('browser.searchPlaceholder')} />
  </div>
  <div class="field">
    <label for="f-deck">{t('browser.deck')}</label>
    <DeckSelect id="f-deck" {decks} bind:value={deck} noneLabel={t('browser.allDecks')} />
  </div>
  <div class="field">
    <label for="f-tag">{t('editor.tags')}</label>
    <select id="f-tag" bind:value={tag}>
      <option value="">{t('browser.allTags')}</option>
      {#each tags as name (name)}<option value={name}>{name}</option>{/each}
    </select>
  </div>
  <div class="field">
    <label for="f-state">{t('browser.status')}</label>
    <select id="f-state" bind:value={status}>
      {#each STATUSES as s (s.value)}<option value={s.value}>{t(s.label)}</option>{/each}
    </select>
  </div>
  <div class="field">
    <label for="f-format">{t('browser.format')}</label>
    <select id="f-format" bind:value={format}>
      <option value="">{t('browser.allFormats')}</option>
      {#each formats as f (f.key)}<option value={f.key}>{formatLabel(f)}</option>{/each}
    </select>
  </div>
</form>

<style>
  .filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: var(--space-2);
  }
</style>
