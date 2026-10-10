<script lang="ts">
  import { t } from '$lib/i18n'
  import ColumnChart from '$lib/ui/charts/ColumnChart.svelte'
  import { forecastColumns } from './format'
  import type { StatsData } from './types'

  interface Props {
    data: StatsData
    now: number
  }
  let { data, now }: Props = $props()

  const columns = $derived(forecastColumns(data.cards, now, data.dayStartHour))
</script>

<section aria-labelledby="forecast-title" class="card-surface stack">
  <h2 id="forecast-title">{t('stats.forecast')}</h2>
  <ColumnChart
    values={columns.values}
    labels={columns.labels}
    ticks={columns.ticks}
    title={t('stats.forecastLabel')}
    describe={(v, label) => t('stats.forecastDay', { n: v, day: label })}
    tableSummary={t('stats.showTable')}
    tableHeader={[t('stats.day'), t('stats.cards')]}
  />
</section>
