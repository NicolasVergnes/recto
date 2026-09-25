<script lang="ts">
  import { t } from '$lib/i18n'
  import { confirmState, settleConfirm } from '$lib/state/confirm.svelte'
  import Dialog from './Dialog.svelte'

  const current = $derived(confirmState.current)
</script>

<Dialog open={current !== null} title={current?.title ?? ''} onclose={() => settleConfirm(false)}>
  <p>{current?.message ?? ''}</p>
  {#snippet actions()}
    <button class="btn" type="button" onclick={() => settleConfirm(false)}>
      {t('common.cancel')}
    </button>
    <button
      class="btn {current?.danger ? 'btn-danger' : 'btn-primary'}"
      type="button"
      onclick={() => settleConfirm(true)}
    >
      {current?.confirmLabel ?? t('common.confirm')}
    </button>
  {/snippet}
</Dialog>
