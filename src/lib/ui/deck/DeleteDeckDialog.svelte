<script lang="ts">
  import { t } from '$lib/i18n'
  import Dialog from '$lib/ui/Dialog.svelte'
  import Icon from '$lib/ui/Icon.svelte'

  interface Props {
    open: boolean
    /** The confirmation, with the deck's name and what it contains. */
    message: string
    /** The screen resets it to `false` each time it opens the dialog: the backup is offered. */
    backupFirst: boolean
    ondelete: () => void
    onclose: () => void
  }
  let { open, message, backupFirst = $bindable(), ondelete, onclose }: Props = $props()
</script>

<Dialog {open} title={t('deck.deleteTitle')} {onclose}>
  <p>{message}</p>
  <label class="check">
    <input type="checkbox" bind:checked={backupFirst} />
    {t('deck.backupFirst')}
  </label>
  {#snippet actions()}
    <button class="btn" type="button" onclick={onclose}>{t('common.cancel')}</button>
    <button class="btn btn-danger" type="button" onclick={ondelete}>
      <Icon name="trash" />
      {t('common.delete')}
    </button>
  {/snippet}
</Dialog>
