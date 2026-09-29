<script lang="ts">
  import { tick } from 'svelte'
  import type { FlipStyle } from '$lib/db/settings'
  import type { BrowserRow } from '$lib/domain/browse'
  import { renderCard } from '$lib/domain/notes'
  import { t } from '$lib/i18n'
  import Icon from '../Icon.svelte'
  import FlipFaces from './FlipFaces.svelte'
  import type { MosaicMode } from './grid'
  import TileFace from './TileFace.svelte'

  interface Props {
    row: BrowserRow
    mode: MosaicMode
    flipStyle: FlipStyle
    /** « both » in a single column: faces one above the other. */
    stacked: boolean
    selected: boolean
    flipped: boolean
    ontoggle: (on: boolean) => void
    onflip: () => void
  }
  let { row, mode, flipStyle, stacked, selected, flipped, ontoggle, onflip }: Props = $props()

  // The browser shows the canonical sides (no Leitner swap), like the table does.
  const rendered = $derived(renderCard(row.note, row.card))
  let root: HTMLElement | undefined = $state()
  /** The back face is mounted at the first flip only, then stays for the return animation. */
  let backSeen = $state(false)

  async function flip() {
    if (!backSeen) {
      backSeen = true
      await tick()
      void root?.offsetHeight // layout flush: the transition starts from the front face
    }
    onflip()
  }
</script>

<article
  class="tile card-surface"
  class:selected
  role="listitem"
  bind:this={root}
  data-flipped={mode === 'flip' ? flipped : undefined}
>
  <p class="meta muted small">
    {row.deckName} · {t(`states.${row.status}`)}{#if row.card.flag}&nbsp;<Icon
        name="flag"
        size={14}
      />{/if}
  </p>
  {#if mode === 'flip'}
    <FlipFaces {flipped} style={flipStyle} backMounted={backSeen || flipped} onflip={flip}>
      {#snippet front()}<TileFace {rendered} side="front" />{/snippet}
      {#snippet back()}<TileFace {rendered} side="back" />{/snippet}
    </FlipFaces>
  {:else}
    <div class="both" class:stacked>
      <TileFace {rendered} side="front" />
      <TileFace {rendered} side="back" />
    </div>
  {/if}
  <footer class="row">
    <label class="check">
      <input
        type="checkbox"
        checked={selected}
        onchange={(e) => ontoggle(e.currentTarget.checked)}
        aria-label={t('browser.selectCard', { q: row.question })}
      />
    </label>
    {#if mode === 'flip'}
      <button class="btn btn-sm btn-ghost" type="button" aria-pressed={flipped} onclick={flip}>
        <Icon name="swap" />
        {t('browser.flip')}
      </button>
    {/if}
    <a class="btn btn-sm btn-ghost" href={`#/notes/${row.note.id}`}>
      <Icon name="edit" />
      {t('browser.edit')}
    </a>
  </footer>
</article>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    height: 100%;
    padding: var(--space-2) var(--space-3);
    gap: var(--space-1);
    --card-font: calc(1rem * var(--font-scale));
  }

  .tile.selected {
    background: var(--accent-soft);
  }

  .both {
    display: grid;
    flex: 1;
    min-height: 0;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }

  .both.stacked {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }

  .both > :global(.side + .side) {
    border-left: 1px solid var(--border);
  }

  .both.stacked > :global(.side + .side) {
    border-left: none;
    border-top: 1px solid var(--border);
  }

  .meta {
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  footer {
    flex-wrap: nowrap;
  }

  footer .btn-sm {
    padding-inline: var(--space-2);
  }

  .check {
    min-height: 2.75rem;
    min-width: 2.75rem;
    justify-content: center;
  }
</style>
