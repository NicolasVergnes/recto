<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity'
  import { live } from '$lib/db/live.svelte'
  import * as repo from '$lib/db/repo'
  import {
    filterRows,
    sortRows,
    type BrowserRow,
    type SortKey,
    type StatusFilter,
  } from '$lib/domain/browse'
  import { parseTags } from '$lib/domain/text'
  import { t, type MessageKey } from '$lib/i18n'
  import { href, type RouteProps } from '$lib/router.svelte'
  import { confirmAction } from '$lib/state/confirm.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import DeckSelect from '$lib/ui/DeckSelect.svelte'
  import Dialog from '$lib/ui/Dialog.svelte'
  import ExportCsvDialog from '$lib/ui/ExportCsvDialog.svelte'
  import { errorMessage } from '$lib/ui/errors'
  import { formatDue } from '$lib/ui/format'
  import Icon from '$lib/ui/Icon.svelte'
  import VirtualList from '$lib/ui/VirtualList.svelte'

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
  const COLUMNS: { key: SortKey; label: MessageKey }[] = [
    { key: 'question', label: 'browser.question' },
    { key: 'answer', label: 'browser.answer' },
    { key: 'deck', label: 'browser.deck' },
    { key: 'status', label: 'browser.status' },
    { key: 'due', label: 'browser.due' },
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

  function sortBy(key: SortKey) {
    if (sortKey === key) sortDir = sortDir === 1 ? -1 : 1
    else {
      sortKey = key
      sortDir = 1
    }
  }

  function toggle(id: string, on: boolean) {
    if (on) selected.add(id)
    else selected.delete(id)
  }

  function selectAllVisible(on: boolean) {
    for (const r of rows) toggle(r.card.id, on)
  }

  const allVisibleSelected = $derived(rows.length > 0 && rows.every((r) => selected.has(r.card.id)))

  let exporting = $state(false)
  let moving = $state(false)
  let moveTarget = $state('')
  let tagging = $state(false)
  let tagText = $state('')

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action()
      toast(done)
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  async function suspend(on: boolean) {
    await run(
      () => repo.setSuspended([...selected], on),
      t(on ? 'browser.suspended' : 'browser.unsuspended'),
    )
  }

  async function reset() {
    const n = selected.size
    const first = await confirmAction({
      title: t('browser.resetTitle'),
      message: t('browser.resetConfirm', { n }),
      confirmLabel: t('browser.reset'),
      danger: true,
    })
    if (!first) return
    const second = await confirmAction({
      title: t('browser.resetTitle'),
      message: t('browser.resetConfirmAgain', { n }),
      confirmLabel: t('browser.resetForSure'),
      danger: true,
    })
    if (second)
      await run(() => repo.resetCards([...selected], Date.now()), t('browser.resetDone', { n }))
  }

  async function remove() {
    const notes = selectedNoteIds.length
    const ok = await confirmAction({
      title: t('browser.deleteTitle'),
      message: t('browser.deleteConfirm', { notes, cards: selectedRows.length }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    await run(
      async () => {
        const ids = [...selectedNoteIds]
        await repo.deleteNotes(ids)
        selected.clear()
      },
      t('browser.deleted', { n: notes }),
    )
  }

  async function move() {
    if (!moveTarget) return
    moving = false
    await run(() => repo.moveNotes(selectedNoteIds, moveTarget, Date.now()), t('browser.moved'))
  }

  async function applyTags(add: boolean) {
    const list = parseTags(tagText)
    tagging = false
    await run(
      () => (add ? repo.addTags : repo.removeTags)(selectedNoteIds, list, Date.now()),
      t('browser.tagged'),
    )
  }
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
    <a class="btn btn-sm" href={href('/notes/new', { deck: deckFilter })}>
      <Icon name="plus" />
      {t('home.addNote')}
    </a>
  </div>

  {#if selected.size > 0}
    <div class="row bulk" role="group" aria-label={t('browser.bulkActions')}>
      <button class="btn btn-sm" type="button" onclick={() => ((moveTarget = ''), (moving = true))}>
        {t('browser.move')}
      </button>
      <button class="btn btn-sm" type="button" onclick={() => ((tagText = ''), (tagging = true))}>
        {t('browser.tag')}
      </button>
      <button class="btn btn-sm" type="button" onclick={() => suspend(true)}>
        <Icon name="pause" />
        {t('review.suspend')}
      </button>
      <button class="btn btn-sm" type="button" onclick={() => suspend(false)}>
        {t('browser.unsuspend')}
      </button>
      <button class="btn btn-sm" type="button" onclick={() => (exporting = true)}>
        <Icon name="download" />
        {t('exportCsv.button')}
      </button>
      <button class="btn btn-sm" type="button" onclick={reset}>{t('browser.reset')}</button>
      <button class="btn btn-sm btn-danger" type="button" onclick={remove}>
        <Icon name="trash" />
        {t('common.delete')}
      </button>
      <button class="btn btn-sm btn-ghost" type="button" onclick={() => selected.clear()}>
        {t('browser.clearSelection')}
      </button>
    </div>
  {/if}

  <div class="table" role="table" aria-label={t('browser.title')} aria-rowcount={rows.length + 1}>
    <div class="tr head" role="row" aria-rowindex={1}>
      <span class="cell check" role="columnheader">
        <input
          type="checkbox"
          checked={allVisibleSelected}
          onchange={(e) => selectAllVisible(e.currentTarget.checked)}
          aria-label={t('browser.selectAll')}
        />
      </span>
      {#each COLUMNS as col (col.key)}
        <span
          class="cell {col.key}"
          role="columnheader"
          aria-sort={sortKey === col.key ? (sortDir === 1 ? 'ascending' : 'descending') : 'none'}
        >
          <button class="sort" type="button" onclick={() => sortBy(col.key)}>
            {t(col.label)}
            {#if sortKey === col.key}<span aria-hidden="true">{sortDir === 1 ? '▲' : '▼'}</span
              >{/if}
          </button>
        </span>
      {/each}
    </div>
    {#if allRows.loaded && rows.length === 0}
      <p class="empty muted">{t('browser.empty')}</p>
    {:else}
      <VirtualList items={rows} rowHeight={52} key={(r) => r.card.id} label={t('browser.rows')}>
        {#snippet row(r: BrowserRow, index: number)}
          <div
            class="tr"
            role="row"
            aria-rowindex={index + 2}
            class:selected={selected.has(r.card.id)}
          >
            <span class="cell check" role="cell">
              <input
                type="checkbox"
                checked={selected.has(r.card.id)}
                onchange={(e) => toggle(r.card.id, e.currentTarget.checked)}
                aria-label={t('browser.selectCard', { q: r.question })}
              />
            </span>
            <span class="cell question" role="cell">
              <a href={`#/notes/${r.note.id}`}>{r.question || '—'}</a>
            </span>
            <span class="cell answer" role="cell">{r.answer}</span>
            <span class="cell deck" role="cell">{r.deckName}</span>
            <span class="cell status" role="cell">
              {t(`states.${r.status}`)}{#if r.card.flag}&nbsp;<Icon name="flag" size={14} />{/if}
            </span>
            <span class="cell due tabular" role="cell">{formatDue(r.card, Date.now())}</span>
          </div>
        {/snippet}
      </VirtualList>
    {/if}
  </div>
</section>

<ExportCsvDialog bind:open={exporting} noteIds={selectedNoteIds} name="recto-selection" />

<Dialog
  open={moving}
  title={t('browser.moveTitle', { n: selectedNoteIds.length })}
  onclose={() => (moving = false)}
>
  <div class="field">
    <label for="move-deck">{t('editor.deck')}</label>
    <DeckSelect id="move-deck" decks={decks.value} bind:value={moveTarget} noneLabel="—" />
  </div>
  {#snippet actions()}
    <button class="btn" type="button" onclick={() => (moving = false)}>{t('common.cancel')}</button>
    <button class="btn btn-primary" type="button" disabled={!moveTarget} onclick={move}>
      {t('browser.move')}
    </button>
  {/snippet}
</Dialog>

<Dialog
  open={tagging}
  title={t('browser.tagTitle', { n: selectedNoteIds.length })}
  onclose={() => (tagging = false)}
>
  <div class="field">
    <label for="tag-text">{t('editor.tags')}</label>
    <input id="tag-text" type="text" bind:value={tagText} />
  </div>
  {#snippet actions()}
    <button class="btn" type="button" onclick={() => (tagging = false)}>{t('common.cancel')}</button
    >
    <button class="btn" type="button" disabled={!tagText.trim()} onclick={() => applyTags(false)}>
      {t('browser.removeTags')}
    </button>
    <button
      class="btn btn-primary"
      type="button"
      disabled={!tagText.trim()}
      onclick={() => applyTags(true)}
    >
      {t('browser.addTags')}
    </button>
  {/snippet}
</Dialog>

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

  .table {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .tr {
    display: grid;
    grid-template-columns: 2.75rem minmax(0, 2fr) minmax(0, 2fr);
    align-items: center;
    height: 52px;
    border-bottom: 1px solid var(--border);
  }

  .tr.selected {
    background: var(--accent-soft);
  }

  .head {
    height: auto;
    min-height: 2.75rem;
    background: var(--surface-2);
    font-weight: 600;
  }

  .cell {
    padding: 0 var(--space-2);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .cell.check {
    display: flex;
    justify-content: center;
  }

  .deck,
  .status,
  .due {
    display: none;
  }

  @media (min-width: 700px) {
    .tr {
      grid-template-columns:
        2.75rem minmax(0, 3fr) minmax(0, 3fr) minmax(0, 2fr) minmax(0, 1.4fr)
        minmax(0, 1.2fr);
    }

    .deck,
    .status,
    .due {
      display: block;
    }
  }

  .sort {
    min-height: 2.75rem;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .question a {
    color: var(--text);
    display: block;
    min-height: 2.75rem;
    line-height: 2.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty {
    padding: var(--space-4);
  }
</style>
