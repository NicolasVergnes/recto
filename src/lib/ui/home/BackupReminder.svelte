<script lang="ts">
  import { t } from '$lib/i18n'
  import Icon from '$lib/ui/Icon.svelte'

  interface Props {
    /** Whole days without a backup (counted from the first deck when there never was one). */
    days: number
    /** Date of the last backup; null when the data was never exported. */
    lastBackupAt: number | null
    busy: boolean
    onbackup: () => void
  }
  let { days, lastBackupAt, busy, onbackup }: Props = $props()
</script>

<div class="notice notice-warning row spread" role="status">
  <span>
    {lastBackupAt ? t('home.backupReminder', { days }) : t('home.neverBackedUp')}
  </span>
  <button class="btn btn-sm" type="button" disabled={busy} onclick={onbackup}>
    <Icon name="download" />
    {t('home.backupNow')}
  </button>
</div>
