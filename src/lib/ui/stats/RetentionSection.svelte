<script lang="ts">
  import { t } from '$lib/i18n'
  import { targetRetention, trueRetention } from '$lib/stats'
  import { pct } from './format'
  import StatTiles, { type StatTile } from './StatTiles.svelte'
  import type { StatsData } from './types'

  interface Props {
    data: StatsData
    now: number
  }
  let { data, now }: Props = $props()

  const target = $derived(targetRetention(data.decks, data.cards))
  const tiles = $derived<StatTile[]>(
    [7, 30, 90].map((days) => {
      const r = trueRetention(data.reviews, now, data.dayStartHour, days)
      return {
        label: t('stats.lastDays', { n: days }),
        figure: pct(r.rate),
        detail: retentionDetail(r.count),
      }
    }),
  )

  function retentionDetail(count: number): string {
    const n = t('stats.retentionCount', { n: count })
    return target === null ? n : `${n} · ${t('stats.target', { pct: pct(target) })}`
  }
</script>

<section aria-labelledby="retention-title" class="stack">
  <h2 id="retention-title">{t('stats.retention')}</h2>
  <p class="muted small">{t('stats.retentionHelp')}</p>
  <StatTiles {tiles} />
</section>
