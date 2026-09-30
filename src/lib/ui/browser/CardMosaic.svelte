<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity'
  import type { FlipStyle, TileSize } from '$lib/db/settings'
  import type { BrowserRow, Sort, SortKey } from '$lib/domain/browse'
  import { t, type MessageKey } from '$lib/i18n'
  import VirtualList from '../VirtualList.svelte'
  import CardTile from './CardTile.svelte'
  import {
    chunk,
    columnsFor,
    GAP_REM,
    tileHeightRem,
    tileMinWidthRem,
    type MosaicMode,
  } from './grid'

  interface Props {
    rows: readonly BrowserRow[]
    loaded: boolean
    selected: SvelteSet<string>
    mode: MosaicMode
    flipStyle: FlipStyle
    size: TileSize
    sort: Sort
    allVisibleSelected: boolean
    onsort: (sort: Sort) => void
    onsize: (size: TileSize) => void
    ontoggle: (id: string, on: boolean) => void
    onselectall: (on: boolean) => void
  }
  let {
    rows,
    loaded,
    selected,
    mode,
    flipStyle,
    size,
    sort,
    allVisibleSelected,
    onsort,
    onsize,
    ontoggle,
    onselectall,
  }: Props = $props()

  const uid = $props.id()
  const SORT_KEYS: { key: SortKey; label: MessageKey }[] = [
    { key: 'created', label: 'browser.created' },
    { key: 'question', label: 'browser.question' },
    { key: 'answer', label: 'browser.answer' },
    { key: 'deck', label: 'browser.deck' },
    { key: 'status', label: 'browser.status' },
    { key: 'due', label: 'browser.due' },
  ]
  const SIZES: { value: TileSize; label: MessageKey }[] = [
    { value: 'small', label: 'browser.sizeSmall' },
    { value: 'medium', label: 'browser.sizeMedium' },
    { value: 'large', label: 'browser.sizeLarge' },
  ]
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

  let width = $state(0)
  const columns = $derived(columnsFor(width, tileMinWidthRem(mode, size) * rem, GAP_REM * rem))
  const stacked = $derived(mode === 'both' && columns === 1)
  const rowHeight = $derived((tileHeightRem(mode, columns, size) + GAP_REM) * rem)
  const gridRows = $derived(chunk(rows, columns))

  // Flipped card ids live here so that a tile scrolled out of the window keeps its face;
  // a mode change turns every tile back (the effect also runs once at mount, on an empty set).
  const flipped = new SvelteSet<string>()
  $effect(() => {
    void mode
    flipped.clear()
  })

  function toggleFlip(id: string) {
    if (!flipped.delete(id)) flipped.add(id)
  }

  function sortKey(value: string) {
    const found = SORT_KEYS.find((s) => s.key === value)
    if (found) onsort({ key: found.key, dir: sort.dir })
  }

  function sizeValue(value: string) {
    const found = SIZES.find((s) => s.value === value)
    if (found) onsize(found.value)
  }
</script>

<div class="mosaic" bind:clientWidth={width}>
  <div class="bar">
    <label class="check small">
      <input
        type="checkbox"
        checked={allVisibleSelected}
        onchange={(e) => onselectall(e.currentTarget.checked)}
      />
      {t('browser.selectAll')}
    </label>
    <span class="control">
      <label class="small" for="{uid}-sort">{t('browser.sortBy')}</label>
      <select id="{uid}-sort" value={sort.key} onchange={(e) => sortKey(e.currentTarget.value)}>
        {#each SORT_KEYS as s (s.key)}<option value={s.key}>{t(s.label)}</option>{/each}
      </select>
    </span>
    <span class="control">
      <label class="small" for="{uid}-dir">{t('browser.order')}</label>
      <select
        id="{uid}-dir"
        value={sort.dir === -1 ? 'desc' : 'asc'}
        onchange={(e) => onsort({ key: sort.key, dir: e.currentTarget.value === 'desc' ? -1 : 1 })}
      >
        <option value="asc">{t('browser.ascending')}</option>
        <option value="desc">{t('browser.descending')}</option>
      </select>
    </span>
    <span class="control">
      <label class="small" for="{uid}-size">{t('browser.tileSize')}</label>
      <select id="{uid}-size" value={size} onchange={(e) => sizeValue(e.currentTarget.value)}>
        {#each SIZES as s (s.value)}<option value={s.value}>{t(s.label)}</option>{/each}
      </select>
    </span>
  </div>
  {#if loaded && rows.length === 0}
    <p class="empty muted">{t('browser.empty')}</p>
  {:else if width > 0}
    <VirtualList
      items={gridRows}
      {rowHeight}
      overscan={1}
      role="list"
      key={(_, i) => String(i)}
      label={t('browser.tiles')}
    >
      {#snippet row(cards: BrowserRow[], index: number)}
        <div
          class="grid-row"
          role="presentation"
          style:height={`${rowHeight}px`}
          style:grid-template-columns={`repeat(${columns}, minmax(0, 1fr))`}
        >
          {#each cards as r, i (r.card.id)}
            <CardTile
              row={r}
              position={index * columns + i + 1}
              total={rows.length}
              {mode}
              {flipStyle}
              {stacked}
              compact={size === 'small'}
              selected={selected.has(r.card.id)}
              flipped={flipped.has(r.card.id)}
              ontoggle={(on) => ontoggle(r.card.id, on)}
              onflip={() => toggleFlip(r.card.id)}
            />
          {/each}
        </div>
      {/snippet}
    </VirtualList>
  {/if}
</div>

<style>
  .mosaic {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    gap: var(--space-2);
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    padding: 0 var(--space-1);
  }

  .control {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .control select {
    width: auto;
  }

  /* One fixed track: a tile never grows with its content (its faces scroll instead). */
  .grid-row {
    display: grid;
    grid-auto-rows: minmax(0, 1fr);
    box-sizing: border-box;
    gap: var(--space-3);
    padding: 0 var(--space-1) var(--space-3);
  }

  .empty {
    padding: var(--space-4);
  }
</style>
