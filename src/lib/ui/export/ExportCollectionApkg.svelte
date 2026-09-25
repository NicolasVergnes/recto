<script lang="ts">
  import type { ApkgExportReport } from '$lib/export/apkg'
  import { t } from '$lib/i18n'
  import { toast } from '$lib/state/toast.svelte'
  import { exportApkg, exportErrorMessage } from './apkg-export-client'
  import ApkgExportSummary from './ApkgExportSummary.svelte'

  let busy = $state(false)
  let report = $state.raw<ApkgExportReport | null>(null)

  /** The whole collection for Anki (05 §4); the report stays under the button. */
  async function run() {
    if (busy) return
    busy = true
    report = null
    try {
      report = await exportApkg({}, 'recto-collection', Date.now())
    } catch (e) {
      toast(exportErrorMessage(e), 'error')
    } finally {
      busy = false
    }
  }
</script>

<div class="row">
  <button class="btn" type="button" aria-disabled={busy} onclick={run}>
    {t('exportApkg.collection')}
  </button>
</div>
<p class="muted small">{t('exportApkg.collectionHelp')}</p>
{#if busy}<progress aria-label={t('exportApkg.exporting')}></progress>{/if}
{#if report}<ApkgExportSummary {report} />{/if}

<style>
  progress {
    width: 100%;
    accent-color: var(--accent);
  }
</style>
