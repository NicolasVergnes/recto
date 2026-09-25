<script lang="ts">
  import type { ImportErrorCode, ImportReport } from '$lib/import/plan'
  import { t, type MessageKey } from '$lib/i18n'

  interface Props {
    report: ImportReport
  }
  let { report }: Props = $props()

  const ERRORS: Record<ImportErrorCode, MessageKey> = {
    emptyFront: 'importReport.emptyFront',
    noCloze: 'importReport.noCloze',
    tooManyRows: 'importReport.tooManyRows',
    emptyFile: 'importReport.emptyFile',
    unknownModel: 'importReport.unknownModel',
    orphanCard: 'importReport.orphanCard',
  }
</script>

<div class="stack report" role="status">
  <h3>{t(report.cancelled ? 'importReport.cancelled' : 'importReport.title')}</h3>
  <ul class="counts tabular">
    <li>{t('importReport.notes', { n: report.notesCreated })}</li>
    <li>{t('importReport.cards', { n: report.cardsCreated })}</li>
    {#if report.decksCreated.length > 0}
      <li>{t('importReport.decks', { names: report.decksCreated.join(', ') })}</li>
    {/if}
    {#if report.notesUpdated > 0}<li>
        {t('importReport.updated', { n: report.notesUpdated })}
      </li>{/if}
    {#if report.skipped > 0}<li>{t('importReport.skipped', { n: report.skipped })}</li>{/if}
    {#if report.reviewsImported > 0}<li>
        {t('importReport.reviews', { n: report.reviewsImported })}
      </li>{/if}
    {#if report.mediaImported > 0}<li>
        {t('importReport.media', { n: report.mediaImported })}
      </li>{/if}
  </ul>
  {#if report.convertedModels.length > 0}
    <div>
      <p class="small">{t('importReport.converted')}</p>
      <ul class="small">
        {#each report.convertedModels as model (model)}<li>{model}</li>{/each}
      </ul>
    </div>
  {/if}
  {#if report.remoteMedia > 0}
    <p class="notice notice-warning small">{t('importReport.remote', { n: report.remoteMedia })}</p>
  {/if}
  {#if report.errors.length > 0}
    <details>
      <summary>{t('importReport.errors', { n: report.errors.length })}</summary>
      <ul class="small">
        {#each report.errors.slice(0, 100) as error, i (i)}
          <li>
            {#if error.line > 0}{t('importReport.line', { n: error.line })}{/if}
            {t(ERRORS[error.code])}
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</div>

<style>
  .report {
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
  }

  .counts {
    margin: 0;
    padding-left: var(--space-5);
  }
</style>
