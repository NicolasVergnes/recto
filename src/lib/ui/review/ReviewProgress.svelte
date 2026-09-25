<script lang="ts">
  import { t } from '$lib/i18n'
  import type { RemainingCounts } from '$lib/queue/session'

  interface Props {
    /** Answers given in this session. */
    done: number
    remaining: RemainingCounts
  }
  let { done, remaining }: Props = $props()

  const progress = $derived.by(() => {
    const left = remaining.learning + remaining.review + remaining.new
    return done + left === 0 ? 1 : done / (done + left)
  })
</script>

<div class="progress" aria-live="polite">
  <div class="track" aria-hidden="true">
    <div class="fill" style:width={`${progress * 100}%`}></div>
  </div>
  <p class="counts small tabular">
    <span class="learning">{t('review.leftLearning', { n: remaining.learning })}</span> ·
    <span class="reviews">{t('review.leftReview', { n: remaining.review })}</span> ·
    <span class="news">{t('review.leftNew', { n: remaining.new })}</span>
  </p>
</div>

<style>
  .progress {
    flex: 1;
  }

  .track {
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--accent);
    transition: width var(--duration) ease;
  }

  .counts {
    margin: var(--space-1) 0 0;
    text-align: center;
    color: var(--text-2);
  }
</style>
