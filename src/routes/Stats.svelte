<script lang="ts">
  import { live } from '$lib/db/live.svelte'
  import * as repo from '$lib/db/repo'
  import { loadStatsData } from '$lib/db/study'
  import { t } from '$lib/i18n'
  import { href, type RouteProps } from '$lib/router.svelte'
  import DeckSelect from '$lib/ui/DeckSelect.svelte'
  import DistributionSections from '$lib/ui/stats/DistributionSections.svelte'
  import ForecastSection from '$lib/ui/stats/ForecastSection.svelte'
  import HeatmapSection from '$lib/ui/stats/HeatmapSection.svelte'
  import RetentionSection from '$lib/ui/stats/RetentionSection.svelte'
  import TodaySection from '$lib/ui/stats/TodaySection.svelte'
  import type { StatsData } from '$lib/ui/stats/types'

  let { query }: RouteProps = $props()
  // svelte-ignore state_referenced_locally
  let deckFilter = $state(query.deck ?? '')
  const decks = live(() => repo.listDecks(), [])

  let data = $state.raw<StatsData | null>(null)
  let now = $state(Date.now())

  $effect(() => {
    const deckId = deckFilter || undefined
    const url = href('/stats', { deck: deckFilter })
    if (location.hash !== url) history.replaceState(history.state, '', url)
    const at = Date.now()
    void loadStatsData(at, deckId).then((d) => {
      now = at
      data = d
    })
  })
</script>

<section class="page page-wide stack stats">
  <h1 tabindex="-1">{t('stats.title')}</h1>

  <form class="filters" onsubmit={(e) => e.preventDefault()}>
    <div class="field">
      <label for="stats-deck">{t('browser.deck')}</label>
      <DeckSelect
        id="stats-deck"
        decks={decks.value}
        bind:value={deckFilter}
        noneLabel={t('browser.allDecks')}
      />
    </div>
  </form>

  {#if data}
    <TodaySection {data} {now} />
    <RetentionSection {data} {now} />
    <ForecastSection {data} {now} />
    <HeatmapSection {data} {now} />
    <DistributionSections {data} />
  {:else}
    <p class="muted">{t('review.loading')}</p>
  {/if}
</section>

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .filters .field {
    min-width: 14rem;
  }
</style>
