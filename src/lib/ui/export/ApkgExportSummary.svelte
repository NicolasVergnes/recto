<script lang="ts">
  import type { ApkgExportReport } from '$lib/export/apkg'
  import { t } from '$lib/i18n'

  interface Props {
    report: ApkgExportReport
  }
  let { report }: Props = $props()
</script>

<div class="stack report" role="status">
  <h3>{t('exportApkg.done')}</h3>
  <ul class="tabular">
    <li>{t('exportApkg.notes', { n: report.notes })}</li>
    <li>{t('exportApkg.cards', { n: report.cards })}</li>
    <li>{t('exportApkg.reviews', { n: report.reviews })}</li>
    <li>{t('exportApkg.media', { n: report.media })}</li>
  </ul>
  {#if report.retired > 0}
    <p class="small">{t('exportApkg.retired', { n: report.retired })}</p>
  {/if}
  {#if report.missingMedia.length > 0}
    <div class="notice notice-warning small stack">
      <p>{t('exportApkg.missingMedia', { n: report.missingMedia.length })}</p>
      <ul>
        {#each report.missingMedia.slice(0, 20) as name (name)}<li>{name}</li>{/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .report {
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
  }

  h3,
  p {
    margin: 0;
  }

  ul {
    margin: 0;
    padding-left: var(--space-5);
    overflow-wrap: anywhere;
  }
</style>
