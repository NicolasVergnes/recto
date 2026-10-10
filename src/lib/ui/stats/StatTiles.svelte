<script lang="ts" module>
  export interface StatTile {
    label: string
    /** The big number. */
    figure: string
    /** Smaller line under the figure. */
    detail?: string
  }
</script>

<script lang="ts">
  interface Props {
    tiles: readonly StatTile[]
  }
  let { tiles }: Props = $props()
</script>

<div class="tiles">
  {#each tiles as tile (tile.label)}
    <div class="tile">
      <span class="label">{tile.label}</span>
      <span class="figure">{tile.figure}</span>
      {#if tile.detail !== undefined}
        <span class="sub muted small">{tile.detail}</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
    gap: var(--space-3);
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-3) var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }

  .label {
    font-size: 0.85rem;
    color: var(--text-2);
  }

  .figure {
    font-size: 1.75rem;
    font-weight: 600;
    line-height: 1.2;
  }
</style>
