<script lang="ts">
  import * as repo from '$lib/db/repo'
  import { BACKUP_EXTENSION, createBackup } from '$lib/export/backup'
  import { shareOrDownload, timestampedName } from '$lib/export/download'
  import { t } from '$lib/i18n'
  import { clearMediaUrls } from '$lib/media/url'
  import { confirmAction } from '$lib/state/confirm.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import Dialog from '../Dialog.svelte'
  import { errorMessage } from '../errors'

  interface Props {
    open: boolean
    /** The screen resets it to `true` each time it opens the dialog. */
    backupFirst: boolean
    onclose: () => void
  }
  let { open, backupFirst = $bindable(), onclose }: Props = $props()

  /** SPEC §5.7: double confirmation, backup offered first. */
  async function wipe() {
    onclose()
    const counts = await repo.collectionCounts()
    const ok = await confirmAction({
      title: t('settings.wipeTitle'),
      message: t('settings.wipeConfirm', { cards: counts.cards, reviews: counts.reviews }),
      confirmLabel: t('settings.wipeForSure'),
      danger: true,
    })
    if (!ok) return
    try {
      if (backupFirst) {
        const now = Date.now()
        await shareOrDownload(
          await createBackup(now),
          timestampedName('recto-avant-effacement', BACKUP_EXTENSION, now),
        )
      }
      clearMediaUrls()
      await repo.wipeAll()
      location.hash = '#/'
      location.reload()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }
</script>

<Dialog {open} title={t('settings.wipeTitle')} {onclose}>
  <p>{t('settings.wipeStep1')}</p>
  <label class="check">
    <input type="checkbox" bind:checked={backupFirst} />
    {t('settings.backupFirst')}
  </label>
  {#snippet actions()}
    <button class="btn" type="button" onclick={onclose}>{t('common.cancel')}</button>
    <button class="btn btn-danger" type="button" onclick={wipe}>{t('settings.continue')}</button>
  {/snippet}
</Dialog>
