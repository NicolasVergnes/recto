<script lang="ts">
  import type { Rating, SchedulerKind } from '$lib/domain/types'
  import { t, type MessageKey } from '$lib/i18n'
  import type { PreviewItem } from '$lib/scheduler'

  interface Props {
    kind: SchedulerKind
    ratings: readonly Rating[]
    previews: Partial<Record<Rating, PreviewItem>>
    suggested?: Rating | null
    disabled?: boolean
    onrate: (rating: Rating) => void
  }
  let { kind, ratings, previews, suggested = null, disabled = false, onrate }: Props = $props()
  let group: HTMLDivElement | undefined = $state()

  /** Focus moves to the first rating button after "Show answer" (svelte5-conventions §5). */
  export function focusFirst() {
    group?.querySelector('button')?.focus()
  }

  const FSRS: Record<Rating, MessageKey> = {
    1: 'review.again',
    2: 'review.hard',
    3: 'review.good',
    4: 'review.easy',
  }
  const LEITNER: Record<Rating, MessageKey> = {
    1: 'review.forgot',
    2: 'review.ok',
    3: 'review.ok',
    4: 'review.sure',
  }
  const COLOR: Record<Rating, string> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' }
  const labels = $derived(kind === 'fsrs' ? FSRS : LEITNER)
</script>

<div
  bind:this={group}
  class="ratings"
  role="group"
  aria-label={t('review.rateGroup')}
  style:--n={ratings.length}
>
  {#each ratings as rating, i (rating)}
    <button
      class="rate {COLOR[rating]}"
      class:suggested={suggested === rating}
      type="button"
      {disabled}
      onclick={() => onrate(rating)}
      aria-keyshortcuts={String(i + 1)}
    >
      <span class="label">{t(labels[rating])}</span>
      <span class="when">{previews[rating]?.label ?? ''}</span>
    </button>
  {/each}
</div>

<style>
  .ratings {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: var(--space-2);
  }

  .rate {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 3.5rem;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius);
    color: #fff;
    font: inherit;
    cursor: pointer;
    transition: filter var(--duration) ease;
  }

  .rate:hover {
    filter: brightness(1.1);
  }

  .rate:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .label {
    font-weight: 700;
  }

  .when {
    font-size: 0.8rem;
    opacity: 0.95;
    font-variant-numeric: tabular-nums;
  }

  .again {
    background: var(--rate-again);
  }

  .hard {
    background: var(--rate-hard);
  }

  .good {
    background: var(--rate-good);
  }

  .easy {
    background: var(--rate-easy);
  }

  .suggested {
    outline: 3px solid var(--text);
    outline-offset: 2px;
  }
</style>
