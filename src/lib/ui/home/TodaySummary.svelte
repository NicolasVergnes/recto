<script lang="ts">
  import { t } from '$lib/i18n'

  interface Props {
    /** Learning and review cards of today's queue. */
    due: number
    /** New cards of today's queue. */
    fresh: number
    /** Today's queue has been read: before that, "nothing to review" would be a guess. */
    loaded: boolean
  }
  let { due, fresh, loaded }: Props = $props()
</script>

<section class="card-surface stack today" aria-labelledby="today-title">
  <h2 id="today-title" class="visually-hidden">{t('common.today')}</h2>
  <p class="tabular counts" aria-live="polite">
    <strong>{t('home.due', { n: due })}</strong>
    <span class="muted" aria-hidden="true">·</span>
    <span>{t('home.newCards', { n: fresh })}</span>
  </p>
  {#if due + fresh > 0}
    <a class="btn btn-primary btn-block big" href="#/review">{t('home.reviewToday')}</a>
  {:else if loaded}
    <p class="muted">{t('home.nothingDue')}</p>
  {/if}
</section>

<style>
  .today .counts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-size: 1.15rem;
    margin: 0;
  }

  .big {
    min-height: 3.5rem;
    font-size: 1.1rem;
  }
</style>
