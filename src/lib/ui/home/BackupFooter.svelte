<script lang="ts">
  import { t } from '$lib/i18n'
  import { formatDateTime } from '$lib/ui/format'
  import Icon from '$lib/ui/Icon.svelte'

  interface Props {
    /** Date of the last backup; null when the data was never exported. */
    lastBackupAt: number | null
    busy: boolean
    onbackup: () => void
  }
  let { lastBackupAt, busy, onbackup }: Props = $props()
</script>

<section class="row spread backup" aria-labelledby="backup-title">
  <h2 id="backup-title" class="visually-hidden">{t('settings.backup')}</h2>
  <span class="muted small">
    {lastBackupAt
      ? t('settings.lastBackup', { date: formatDateTime(lastBackupAt) })
      : t('settings.neverBackedUp')}
  </span>
  <button class="btn btn-sm" type="button" disabled={busy} onclick={onbackup}>
    <Icon name="download" />
    {t('home.backupNow')}
  </button>
</section>

<style>
  .backup {
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
  }
</style>
