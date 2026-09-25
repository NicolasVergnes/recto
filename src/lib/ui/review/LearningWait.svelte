<script lang="ts">
  import { t } from '$lib/i18n'
  import { formatInterval } from '$lib/ui/format'

  interface Props {
    /** Due time of the next learning card set aside. */
    due: number | null
    now: number
    /** The user chose to wait: the screen resumes by itself when the card is due. */
    waiting: boolean
    onfinish: () => void
  }
  let { due, now, waiting = $bindable(), onfinish }: Props = $props()
</script>

<div class="page stack end">
  <h2>{t('review.learningSoon')}</h2>
  <p>
    {t('review.learningSoonText', { when: formatInterval(Math.max(0, (due ?? now) - now)) })}
  </p>
  <div class="row">
    {#if waiting}
      <p class="muted" aria-live="polite">{t('review.waiting')}</p>
    {:else}
      <button class="btn btn-primary" type="button" onclick={() => (waiting = true)}>
        {t('review.wait')}
      </button>
    {/if}
    <button class="btn" type="button" onclick={onfinish}>{t('review.finish')}</button>
  </div>
</div>

<style>
  .end {
    padding-top: var(--space-8);
  }
</style>
