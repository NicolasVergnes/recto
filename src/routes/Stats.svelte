<script lang="ts">
  import { live } from '$lib/db/live.svelte'
  import * as repo from '$lib/db/repo'
  import { loadStatsData } from '$lib/db/study'
  import type { CardStatus } from '$lib/domain/browse'
  import { t, type MessageKey } from '$lib/i18n'
  import { formatInterval } from '$lib/i18n/format'
  import { href, type RouteProps } from '$lib/router.svelte'
  import { addDays, studyDate } from '$lib/scheduler/day'
  import {
    boxDistribution,
    forecast,
    heatmap,
    stateDistribution,
    targetRetention,
    todayStats,
    trueRetention,
    type HeatDay,
  } from '$lib/stats'
  import BarList from '$lib/ui/charts/BarList.svelte'
  import ColumnChart from '$lib/ui/charts/ColumnChart.svelte'
  import Heatmap from '$lib/ui/charts/Heatmap.svelte'
  import DeckSelect from '$lib/ui/DeckSelect.svelte'

  let { query }: RouteProps = $props()
  // svelte-ignore state_referenced_locally
  let deckFilter = $state(query.deck ?? '')
  const decks = live(() => repo.listDecks(), [])

  type Data = Awaited<ReturnType<typeof loadStatsData>>
  let data = $state.raw<Data | null>(null)
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

  const pct = (x: number | null) =>
    x === null ? '—' : t('common.percent', { n: Math.round(x * 100) })
  const fmt = new Intl.NumberFormat('fr-FR')
  const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'numeric' })
  const longDate = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const today = $derived(data ? todayStats(data.reviews, now, data.dayStartHour) : null)
  const retention = $derived(
    data
      ? [7, 30, 90].map((days) =>
          trueRetention(data?.reviews ?? [], now, data?.dayStartHour ?? 4, days),
        )
      : [],
  )
  const target = $derived(data ? targetRetention(data.decks, data.cards) : null)
  const days30 = $derived.by(() => {
    if (!data) return { values: [], labels: [], ticks: [] }
    const values = forecast(data.cards, now, data.dayStartHour)
    const start = studyDate(now, data.dayStartHour)
    const dates = values.map((_, i) => {
      const d = addDays(start, i)
      return new Date(d.year, d.month, d.day, 12)
    })
    return {
      values,
      labels: dates.map((d, i) =>
        i === 0 ? t('common.today') : i === 1 ? t('common.tomorrow') : longDate.format(d),
      ),
      ticks: dates.map((d, i) => (i % 5 === 0 ? shortDate.format(d) : '')),
    }
  })
  const heat = $derived(data ? heatmap(data.reviews, now, data.dayStartHour) : [])
  const totalYear = $derived(heat.reduce((s, d) => s + d.count, 0))
  const STATES: { key: CardStatus; label: MessageKey }[] = [
    { key: 'new', label: 'states.new' },
    { key: 'learning', label: 'states.learning' },
    { key: 'review', label: 'states.review' },
    { key: 'relearning', label: 'states.relearning' },
    { key: 'suspended', label: 'states.suspended' },
    { key: 'retired', label: 'states.retired' },
  ]
  const states = $derived.by(() => {
    const counts = data ? stateDistribution(data.cards) : null
    return STATES.map((s) => ({ label: t(s.label), value: counts?.[s.key] ?? 0 }))
  })
  const boxes = $derived(data ? boxDistribution(data.cards, data.decks) : [])
  const hasLeitner = $derived(!!data?.decks.some((d) => d.scheduler === 'leitner'))

  function retentionSub(count: number): string {
    const n = t('stats.retentionCount', { n: count })
    return target === null ? n : `${n} · ${t('stats.target', { pct: pct(target) })}`
  }

  function describeDay(day: HeatDay): string {
    const [y = 0, m = 1, d = 1] = day.key.split('-').map(Number)
    return t('stats.heatDay', { n: day.count, date: longDate.format(new Date(y, m - 1, d, 12)) })
  }
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

  {#if data && today}
    <section aria-labelledby="today-title" class="stack">
      <h2 id="today-title">{t('common.today')}</h2>
      <div class="tiles">
        <div class="tile">
          <span class="label">{t('stats.dueToday')}</span>
          <span class="figure">{fmt.format(data.today.learning + data.today.review)}</span>
          <span class="sub muted small"
            >{t('stats.dueDetail', {
              learning: data.today.learning,
              review: data.today.review,
            })}</span
          >
        </div>
        <div class="tile">
          <span class="label">{t('stats.newToday')}</span>
          <span class="figure">{fmt.format(data.today.new)}</span>
        </div>
        <div class="tile">
          <span class="label">{t('stats.done')}</span>
          <span class="figure">{fmt.format(today.done)}</span>
          <span class="sub muted small"
            >{t('stats.time', {
              time: today.timeMs > 0 ? formatInterval(Math.max(60_000, today.timeMs)) : '0 min',
            })}</span
          >
        </div>
        <div class="tile">
          <span class="label">{t('stats.success')}</span>
          <span class="figure">{pct(today.successRate)}</span>
        </div>
      </div>
    </section>

    <section aria-labelledby="retention-title" class="stack">
      <h2 id="retention-title">{t('stats.retention')}</h2>
      <p class="muted small">{t('stats.retentionHelp')}</p>
      <div class="tiles">
        {#each retention as r (r.days)}
          <div class="tile">
            <span class="label">{t('stats.lastDays', { n: r.days })}</span>
            <span class="figure">{pct(r.rate)}</span>
            <span class="sub muted small">
              {retentionSub(r.count)}
            </span>
          </div>
        {/each}
      </div>
    </section>

    <section aria-labelledby="forecast-title" class="card-surface stack">
      <h2 id="forecast-title">{t('stats.forecast')}</h2>
      <ColumnChart
        values={days30.values}
        labels={days30.labels}
        ticks={days30.ticks}
        title={t('stats.forecastLabel')}
        describe={(v, label) => t('stats.forecastDay', { n: v, day: label })}
        tableSummary={t('stats.showTable')}
        tableHeader={[t('stats.day'), t('stats.cards')]}
      />
    </section>

    <section aria-labelledby="heat-title" class="card-surface stack">
      <h2 id="heat-title">{t('stats.heatmap')}</h2>
      <p class="muted small tabular">{t('stats.heatTotal', { n: totalYear })}</p>
      <Heatmap
        days={heat}
        title={t('stats.heatmapLabel')}
        less={t('stats.less')}
        more={t('stats.more')}
        weekdays={[t('stats.mon'), '', t('stats.wed'), '', t('stats.fri'), '', '']}
        describe={describeDay}
        tableSummary={t('stats.showTable')}
        tableHeader={[t('stats.month'), t('stats.reviews')]}
      />
    </section>

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
