<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity'
  import { live } from '$lib/db/live.svelte'
  import * as repo from '$lib/db/repo'
  import type { BrowserView } from '$lib/db/settings'
  import {
    filterRows,
    sortRows,
    type Sort,
    type SortKey,
    type StatusFilter,
  } from '$lib/domain/browse'
  import { t, type MessageKey } from '$lib/i18n'
  import { href, type RouteProps } from '$lib/router.svelte'
  import { prefs, setBrowserView } from '$lib/state/prefs.svelte'
  import BulkActions from '$lib/ui/browser/BulkActions.svelte'
  import CardMosaic from '$lib/ui/browser/CardMosaic.svelte'
  import CardTable from '$lib/ui/browser/CardTable.svelte'
  import DeckSelect from '$lib/ui/DeckSelect.svelte'
  import Icon from '$lib/ui/Icon.svelte'

  let { query }: RouteProps = $props()

  const STATUSES: { value: StatusFilter; label: MessageKey }[] = [
    { value: '', label: 'browser.allStates' },
    { value: 'new', label: 'states.new' },
    { value: 'learning', label: 'states.learning' },
    { value: 'review', label: 'states.review' },
    { value: 'relearning', label: 'states.relearning' },
    { value: 'suspended', label: 'states.suspended' },
    { value: 'retired', label: 'states.retired' },
    { value: 'flagged', label: 'browser.flagged' },
  ]
  const VIEWS: { value: BrowserView; label: MessageKey }[] = [
    { value: 'list', label: 'browser.viewList' },
    { value: 'flip', label: 'browser.viewFlip' },
    { value: 'both', label: 'browser.viewBoth' },
  ]

  // svelte-ignore state_referenced_locally
  let deckFilter = $state(query.deck ?? '')
  // svelte-ignore state_referenced_locally
  let q = $state(query.q ?? '')
  // svelte-ignore state_referenced_locally
  let tag = $state(query.tag ?? '')
  let status = $state<StatusFilter>(STATUSES.find((s) => s.value === query.state)?.value ?? '')
  let sortKey = $state<SortKey>('created')
  let sortDir = $state<1 | -1>(1)
  const selected = new SvelteSet<string>()

  const decks = live(() => repo.listDecks(), [])
  const tags = live(() => repo.allTags(), [])
  const allRows = live(() => repo.loadBrowserRows(), [])

  // A parent deck filter includes its sub-decks.
  const deckIds = $derived(
    deckFilter
      ? [deckFilter, ...decks.value.filter((d) => d.parentId === deckFilter).map((d) => d.id)]
      : null,
  )
  const rows = $derived(
    sortRows(filterRows(allRows.value, { deckIds, q, tag, status }), {
      key: sortKey,
      dir: sortDir,
    }),
  )
  const selectedRows = $derived(allRows.value.filter((r) => selected.has(r.card.id)))
  const selectedNoteIds = $derived([...new Set(selectedRows.map((r) => r.note.id))])

  // Keep the filters in the URL without adding history entries.
  $effect(() => {
    const url = href('/cards', { deck: deckFilter, q, tag, state: status })
    if (location.hash !== url) history.replaceState(history.state, '', url)
  })

  /** Table header: the same column again flips the direction. */
  function sortBy(key: SortKey) {
    if (sortKey === key) sortDir = sortDir === 1 ? -1 : 1
    else {
      sortKey = key
      sortDir = 1
    }
  }

  function setSort(sort: Sort) {
    sortKey = sort.key
    sortDir = sort.dir
  }

  function toggle(id: string, on: boolean) {
    if (on) selected.add(id)
    else selected.delete(id)
  }

  function selectAllVisible(on: boolean) {
    for (const r of rows) toggle(r.card.id, on)
  }

  const allVisibleSelected = $derived(rows.length > 0 && rows.every((r) => selected.has(r.card.id)))
</script>

<section class="page page-wide browser">
  <h1 tabindex="-1">{t('browser.title')}</h1>

  <form class="filters" role="search" onsubmit={(e) => e.preventDefault()}>
    <div class="field">
      <label for="f-q">{t('common.search')}</label>
      <input id="f-q" type="search" bind:value={q} placeholder={t('browser.searchPlaceholder')} />
    </div>
    <div class="field">
      <label for="f-deck">{t('browser.deck')}</label>
      <DeckSelect
        id="f-deck"
        decks={decks.value}
        bind:value={deckFilter}
        noneLabel={t('browser.allDecks')}
      />
    </div>
    <div class="field">
      <label for="f-tag">{t('editor.tags')}</label>
      <select id="f-tag" bind:value={tag}>
        <option value="">{t('browser.allTags')}</option>
        {#each tags.value as name (name)}<option value={name}>{name}</option>{/each}
      </select>
    </div>
    <div class="field">
      <label for="f-state">{t('browser.status')}</label>
      <select id="f-state" bind:value={status}>
        {#each STATUSES as s (s.value)}<option value={s.value}>{t(s.label)}</option>{/each}
      </select>
    </div>
  </form>

  <div class="toolbar row spread">
    <p class="muted small tabular" aria-live="polite">
      {t('browser.count', { n: rows.length })}
      {#if selected.size > 0}· {t('browser.selectedCount', { n: selected.size })}{/if}
    </p>
    <fieldset class="view">
      <legend class="visually-hidden">{t('browser.view')}</legend>
      <div class="row">
        {#each VIEWS as view (view.value)}
          <label class="check small">
            <input
              type="radio"
              name="browser-view"
              value={view.value}
              checked={prefs.browserView === view.value}
              onchange={() => setBrowserView(view.value)}
            />
            {t(view.label)}
          </label>
        {/each}
      </div>
    </fieldset>
    <a class="btn btn-sm" href={href('/notes/new', { deck: deckFilter })}>
      <Icon name="plus" />
      {t('home.addNote')}
    </a>
  </div>

  <BulkActions {selected} {selectedRows} {selectedNoteIds} decks={decks.value} />
  {#if !prefs.loaded}
    <!-- The remembered view arrives with the preferences: no table flashing before the mosaic. -->
  {:else if prefs.browserView === 'list'}
    <CardTable
      {rows}
      loaded={allRows.loaded}
      {selected}
      sort={{ key: sortKey, dir: sortDir }}
      {allVisibleSelected}
      onsort={sortBy}
      ontoggle={toggle}
      onselectall={selectAllVisible}
    />
  {:else}
    <CardMosaic
      {rows}
      loaded={allRows.loaded}
      {selected}
      mode={prefs.browserView}
      flipStyle={prefs.flipStyle}
      sort={{ key: sortKey, dir: sortDir }}
      {allVisibleSelected}
      onsort={setSort}
      ontoggle={toggle}
      onselectall={selectAllVisible}
    />
  {/if}
</section>

<style>
  .browser {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    height: calc(100dvh - 4.5rem);
  }

  @media (min-width: 900px) {
    .browser {
      height: 100dvh;
    }
  }

  .filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: var(--space-2);
  }

  .toolbar p {
    margin: 0;
  }

  .view {
    margin: 0;
    padding: 0;
    border: none;
  }
</style>
