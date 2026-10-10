<script lang="ts">
  import { t } from '$lib/i18n'
  import { heatmap } from '$lib/stats'
  import Heatmap from '$lib/ui/charts/Heatmap.svelte'
  import { describeHeatDay } from './format'
  import type { StatsData } from './types'

  interface Props {
    data: StatsData
    now: number
  }
  let { data, now }: Props = $props()

  const heat = $derived(heatmap(data.reviews, now, data.dayStartHour))
  const totalYear = $derived(heat.reduce((s, d) => s + d.count, 0))
</script>

<section aria-labelledby="heat-title" class="card-surface stack">
  <h2 id="heat-title">{t('stats.heatmap')}</h2>
  <p class="muted small tabular">{t('stats.heatTotal', { n: totalYear })}</p>
  <Heatmap
    days={heat}
    title={t('stats.heatmapLabel')}
    less={t('stats.less')}
    more={t('stats.more')}
    weekdays={[t('stats.mon'), '', t('stats.wed'), '', t('stats.fri'), '', '']}
    describe={describeHeatDay}
    tableSummary={t('stats.showTable')}
    tableHeader={[t('stats.month'), t('stats.reviews')]}
  />
</section>
