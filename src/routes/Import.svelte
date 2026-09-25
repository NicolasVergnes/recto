<script lang="ts">
  import { t } from '$lib/i18n'
  import type { RouteProps } from '$lib/router.svelte'
  import BackupRestore from '$lib/ui/import/BackupRestore.svelte'
  import CsvImport from '$lib/ui/import/CsvImport.svelte'

  let _props: RouteProps = $props()
</script>

<section class="page page-wide stack">
  <h1 tabindex="-1">{t('import.title')}</h1>
  <p class="muted">{t('import.intro')}</p>

  <details class="card-surface" open>
    <summary><h2>{t('import.csv')}</h2></summary>
    <CsvImport />
  </details>

  <details class="card-surface">
    <summary><h2>{t('import.apkg')}</h2></summary>
    <p class="muted">{t('common.comingSoon')}</p>
  </details>

  <details class="card-surface">
    <summary><h2>{t('import.backup')}</h2></summary>
    <BackupRestore />
  </details>
</section>

<style>
  summary {
    cursor: pointer;
    list-style: revert;
    min-height: 2.75rem;
  }

  summary h2 {
    display: inline;
    margin: 0;
  }

  details[open] summary {
    margin-bottom: var(--space-3);
  }
</style>
