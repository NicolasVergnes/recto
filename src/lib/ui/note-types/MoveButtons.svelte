<script lang="ts" module>
  import { tick } from 'svelte'

  /**
   * After a move, focus follows the moved row. Rows are keyed by position, so the button that
   * was pressed now belongs to the row that took its place: focus goes to the same button of the
   * moved row, or to the other one when this one has just been disabled (the row reached an end).
   */
  export async function focusMoved(id: string, by: -1 | 1): Promise<void> {
    await tick()
    const [same, other] = by < 0 ? (['up', 'down'] as const) : (['down', 'up'] as const)
    const button = document.getElementById(`${id}-${same}`)
    const usable = button instanceof HTMLButtonElement && !button.disabled
    ;(usable ? button : document.getElementById(`${id}-${other}`))?.focus()
  }
</script>

<script lang="ts">
  interface Props {
    /** Id of the row: its buttons are `<id>-up` and `<id>-down` (see `focusMoved`). */
    id: string
    /** Accessible names: the buttons show an arrow, like « Retirer » shows a bin. */
    upLabel: string
    downLabel: string
    /** The first row cannot go up, the last one cannot go down. */
    first: boolean
    last: boolean
    onmove: (by: -1 | 1) => void
  }
  let { id, upLabel, downLabel, first, last, onmove }: Props = $props()
</script>

<button
  class="btn btn-sm btn-ghost arrow"
  type="button"
  id="{id}-up"
  disabled={first}
  onclick={() => onmove(-1)}
>
  <span aria-hidden="true">↑</span>
  <span class="visually-hidden">{upLabel}</span>
</button>
<button
  class="btn btn-sm btn-ghost arrow"
  type="button"
  id="{id}-down"
  disabled={last}
  onclick={() => onmove(1)}
>
  <span aria-hidden="true">↓</span>
  <span class="visually-hidden">{downLabel}</span>
</button>

<style>
  /* A typographic arrow, as heavy as the 20 px bin icon beside it. */
  .arrow {
    font-size: 1.4rem;
    font-weight: 700;
    line-height: 1;
  }
</style>
