<script lang="ts" generics="T">
  import type { Snippet } from 'svelte'

  interface Props {
    items: readonly T[]
    rowHeight: number
    key: (item: T) => string
    row: Snippet<[T, number]>
    label: string
    overscan?: number
  }
  let { items, rowHeight, key, row, label, overscan = 10 }: Props = $props()

  let scrollTop = $state(0)
  let viewport = $state(600)
  const start = $derived(Math.max(0, Math.floor(scrollTop / rowHeight) - overscan))
  const end = $derived(
    Math.min(items.length, Math.ceil((scrollTop + viewport) / rowHeight) + overscan),
  )
  const visible = $derived(items.slice(start, end))
</script>

<!-- Only the visible rows are in the DOM (SPEC §6: browser virtualised, ≥ 5 000 rows). -->
<div
  class="viewport"
  role="rowgroup"
  aria-label={label}
  bind:clientHeight={viewport}
  onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}
>
  <div class="spacer" style:height={`${items.length * rowHeight}px`}>
    <div class="window" style:transform={`translateY(${start * rowHeight}px)`}>
      {#each visible as item, i (key(item))}
        {@render row(item, start + i)}
      {/each}
    </div>
  </div>
</div>

<style>
  .viewport {
    flex: 1;
    min-height: 12rem;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .spacer {
    position: relative;
  }

  .window {
    position: absolute;
    inset: 0 0 auto 0;
  }
</style>
