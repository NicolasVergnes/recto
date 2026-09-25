<script lang="ts">
  import type { ApkgExportReport } from '$lib/export/apkg'
  import { t } from '$lib/i18n'

  interface Props {
    report: ApkgExportReport | null
    busy: boolean
  }
  let { report, busy }: Props = $props()
  const SHOWN = 20

  /** Spoken by the live region, which stays in the page: inserted regions are often not read. */
  const announcement = $derived.by(() => {
    if (busy) return t('exportApkg.exporting')
    if (!report) return ''
    const counts = t('exportApkg.announce', {
      notes: t('exportApkg.notes', { n: report.notes }),
      cards: t('exportApkg.cards', { n: report.cards }),
      reviews: t('exportApkg.reviews', { n: report.reviews }),
      media: t('exportApkg.media', { n: report.media }),
    })
    const retired = report.retired > 0 ? t('exportApkg.retired', { n: report.retired }) : ''
    const missing = report.missingMedia.length
    return [counts, retired, missing > 0 ? t('exportApkg.missingCount', { n: missing }) : '']
      .filter((s) => s !== '')
      .join(' ')
  })
</script>

<p class="visually-hidden" role="status">{announcement}</p>
{#if report}
  <div class="stack report">
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
          {#each report.missingMedia.slice(0, SHOWN) as name (name)}<li>{name}</li>{/each}
          {#if report.missingMedia.length > SHOWN}
            <li>{t('exportApkg.more', { n: report.missingMedia.length - SHOWN })}</li>
          {/if}
        </ul>
      </div>
    {/if}
  </div>
{/if}

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
