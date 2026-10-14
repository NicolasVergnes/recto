<script lang="ts">
  import { BACKUP_EXTENSION, createBackup } from '$lib/export/backup'
  import { shareOrDownload, timestampedName } from '$lib/export/download'
  import { t } from '$lib/i18n'
  import { toast } from '$lib/state/toast.svelte'
  import { errorMessage } from '../errors'
  import { formatDateTime } from '../format'

  interface Props {
    lastBackupAt: number | null
    /** Reloads what the screen shows once a backup is saved. */
    onrefresh: () => Promise<void>
  }
  let { lastBackupAt, onrefresh }: Props = $props()

  let busy = $state(false)

  async function backup() {
    busy = true
    try {
      const now = Date.now()
      const blob = await createBackup(now)
      await shareOrDownload(blob, timestampedName('recto-sauvegarde', BACKUP_EXTENSION, now))
      toast(t('settings.backupDone'))
      await onrefresh()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      busy = false
    }
  }
</script>

<section class="card-surface stack" aria-labelledby="backup-title">
  <h2 id="backup-title">{t('settings.backup')}</h2>
  <p class="muted small">
    {lastBackupAt
      ? t('settings.lastBackup', { date: formatDateTime(lastBackupAt) })
      : t('settings.neverBackedUp')}
  </p>
  <div class="row">
    <button class="btn btn-primary" type="button" disabled={busy} onclick={backup}>
      {t('home.backupNow')}
    </button>
    <a class="btn" href="#/import">{t('settings.restore')}</a>
  </div>
</section>
