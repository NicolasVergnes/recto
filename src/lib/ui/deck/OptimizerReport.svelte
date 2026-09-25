<script lang="ts">
  import { t } from '$lib/i18n'
  import type { OptimizationReport, ParamsSummary } from '$lib/scheduler/optimizer'

  interface Props {
    report: OptimizationReport
  }
  let { report }: Props = $props()
  const id = $props.id()

  const number = (digits: number) =>
    new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const zero = number(0)
  const one = number(1)
  const three = number(3)
  const four = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 4 })

  const percent = (x: number, format = zero) => t('common.percent', { n: format.format(x * 100) })
  const intervals = (s: ParamsSummary) =>
    s.intervals.map((n) => t('optimizer.days', { n })).join(' · ')
  const values = (s: ParamsSummary) => s.params.map((x) => four.format(x)).join(' · ')

  const columns = $derived([report.old, report.next])
</script>

<div class="stack">
  <p class="notice">
    {t(report.better ? 'optimizer.better' : 'optimizer.notBetter')}
  </p>
  <table class="small tabular" aria-describedby={`${id}-explain`}>
    <caption>{t('optimizer.caption')}</caption>
    <thead>
      <tr>
        <th scope="col">{t('optimizer.metric')}</th>
        <th scope="col">{t('optimizer.current')}</th>
        <th scope="col">{t('optimizer.proposed')}</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <th scope="row">{t('optimizer.rmse')}</th>
        {#each columns as s, i (i)}<td>{percent(s.rmse, one)}</td>{/each}
      </tr>
      <tr>
        <th scope="row">{t('optimizer.logLoss')}</th>
        {#each columns as s, i (i)}<td>{three.format(s.logLoss)}</td>{/each}
      </tr>
      <tr>
        <th scope="row">
          {t('optimizer.predicted')}
          <span class="muted"
            >({t('optimizer.observed', { pct: percent(report.old.observed) })})</span
          >
        </th>
        {#each columns as s, i (i)}<td>{percent(s.predicted)}</td>{/each}
      </tr>
      <tr>
        <th scope="row">{t('optimizer.intervals')}</th>
        {#each columns as s, i (i)}<td>{intervals(s)}</td>{/each}
      </tr>
    </tbody>
  </table>
  <p id={`${id}-explain`} class="muted small">{t('optimizer.explain')}</p>
  <details>
    <summary>{t('optimizer.values')}</summary>
    <dl class="small tabular">
      <dt>{t('optimizer.current')}</dt>
      <dd>{values(report.old)}</dd>
      <dt>{t('optimizer.proposed')}</dt>
      <dd>{values(report.next)}</dd>
    </dl>
  </details>
</div>

<style>
  caption {
    text-align: left;
    font-weight: 600;
    padding-bottom: var(--space-2);
  }

  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: var(--space-2);
    border-bottom: 1px solid var(--border);
  }

  th[scope='row'] {
    font-weight: 500;
  }

  summary {
    line-height: 2.75rem;
    cursor: pointer;
  }

  dl {
    margin: 0;
  }

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0 0 var(--space-2);
    overflow-wrap: anywhere;
  }
</style>
