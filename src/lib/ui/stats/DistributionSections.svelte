<script lang="ts">
  import type { CardStatus } from '$lib/domain/browse'
  import { t, type MessageKey } from '$lib/i18n'
  import { boxDistribution, stateDistribution } from '$lib/stats'
  import BarList from '$lib/ui/charts/BarList.svelte'
  import type { StatsData } from './types'

  interface Props {
    data: StatsData
  }
  let { data }: Props = $props()

  const STATES: { key: CardStatus; label: MessageKey }[] = [
    { key: 'new', label: 'states.new' },
    { key: 'learning', label: 'states.learning' },
    { key: 'review', label: 'states.review' },
    { key: 'relearning', label: 'states.relearning' },
    { key: 'suspended', label: 'states.suspended' },
    { key: 'retired', label: 'states.retired' },
  ]
  const states = $derived.by(() => {
    const counts = stateDistribution(data.cards)
    return STATES.map((s) => ({ label: t(s.label), value: counts[s.key] }))
  })
  const boxes = $derived(boxDistribution(data.cards, data.decks))
  const hasLeitner = $derived(data.decks.some((d) => d.scheduler === 'leitner'))
</script>

<div class="two">
  <section aria-labelledby="states-title" class="card-surface stack">
    <h2 id="states-title">{t('stats.states')}</h2>
    <BarList
      rows={states}
      caption={t('stats.states')}
      header={[t('browser.status'), t('stats.cards')]}
    />
  </section>
  {#if hasLeitner}
    <section aria-labelledby="boxes-title" class="card-surface stack">
      <h2 id="boxes-title">{t('stats.boxes')}</h2>
      <BarList
        rows={boxes.map((value, i) => ({ label: t('scheduler.box', { n: i + 1 }), value }))}
        caption={t('stats.boxes')}
        header={[t('info.box'), t('stats.cards')]}
      />
    </section>
  {/if}
</div>

<style>
  .two {
    display: grid;
    gap: var(--space-4);
  }

  @media (min-width: 900px) {
    .two {
      grid-template-columns: 1fr 1fr;
      align-items: start;
    }
  }
</style>
