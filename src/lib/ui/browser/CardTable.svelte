<script lang="ts">
  import type { SvelteSet } from 'svelte/reactivity'
  import type { BrowserRow, Sort, SortKey } from '$lib/domain/browse'
  import { t, type MessageKey } from '$lib/i18n'
  import { formatDue } from '$lib/ui/format'
  import Icon from '$lib/ui/Icon.svelte'
  import VirtualList from '$lib/ui/VirtualList.svelte'

  interface Props {
    rows: readonly BrowserRow[]
    /** allRows.loaded: distinguishes "still loading" from "no match". */
    loaded: boolean
    selected: SvelteSet<string>
    sort: Sort
    allVisibleSelected: boolean
    onsort: (key: SortKey) => void
    ontoggle: (id: string, on: boolean) => void
    onselectall: (on: boolean) => void
  }
  let { rows, loaded, selected, sort, allVisibleSelected, onsort, ontoggle, onselectall }: Props =
    $props()

  const COLUMNS: { key: SortKey; label: MessageKey }[] = [
    { key: 'question', label: 'browser.question' },
    { key: 'answer', label: 'browser.answer' },
    { key: 'deck', label: 'browser.deck' },
    { key: 'status', label: 'browser.status' },
    { key: 'due', label: 'browser.due' },
  ]
</script>

<div class="table" role="table" aria-label={t('browser.title')} aria-rowcount={rows.length + 1}>
  <div class="tr head" role="row" aria-rowindex={1}>
    <span class="cell check" role="columnheader">
      <input
        type="checkbox"
        checked={allVisibleSelected}
        onchange={(e) => onselectall(e.currentTarget.checked)}
        aria-label={t('browser.selectAll')}
      />
    </span>
    {#each COLUMNS as col (col.key)}
      <span
        class="cell {col.key}"
        role="columnheader"
        aria-sort={sort.key === col.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
      >
        <button class="sort" type="button" onclick={() => onsort(col.key)}>
          {t(col.label)}
          {#if sort.key === col.key}<span aria-hidden="true">{sort.dir === 1 ? '▲' : '▼'}</span
            >{/if}
        </button>
      </span>
    {/each}
  </div>
  {#if loaded && rows.length === 0}
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
              onchange={(e) => ontoggle(r.card.id, e.currentTarget.checked)}
              aria-label={t('browser.selectCard', { q: r.question || '—' })}
            />
          </span>
          <span class="cell question" role="cell">
            <a href={`#/notes/${r.note.id}`}>{r.question || '—'}</a>
          </span>
          <span class="cell answer" role="cell">{r.answer}</span>
          <span class="cell deck" role="cell">{r.deckName}</span>
          <span class="cell status" role="cell">
            {t(`states.${r.status}`)}{#if r.card.flag}&nbsp;<Icon name="flag" size={14} /><span
                class="visually-hidden">{t('review.flag')}</span
              >{/if}
          </span>
          <span class="cell due tabular" role="cell">{formatDue(r.card, Date.now())}</span>
        </div>
      {/snippet}
    </VirtualList>
  {/if}
</div>

<style>
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
