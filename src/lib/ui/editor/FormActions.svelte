<script lang="ts">
  import { t } from '$lib/i18n'

  interface Props {
    /** Existing note: Save/Cancel; new note: Add/Add and close. */
    editing: boolean
    canSave: boolean
    onaddclose: () => void
  }
  let { editing, canSave, onaddclose }: Props = $props()
</script>

<!-- Inside the editor form: the primary button submits it (Enter, Ctrl+Entrée). -->
<div class="row actions">
  {#if editing}
    <button class="btn btn-primary" type="submit" disabled={!canSave}>
      {t('common.save')}
    </button>
    <button class="btn" type="button" onclick={() => history.back()}>
      {t('common.cancel')}
    </button>
  {:else}
    <button class="btn btn-primary" type="submit" disabled={!canSave}>
      {t('editor.add')}
    </button>
    <button class="btn" type="button" disabled={!canSave} onclick={onaddclose}>
      {t('editor.addClose')}
    </button>
  {/if}
  <span class="muted small">{t('editor.shortcuts')}</span>
</div>

<style>
  .actions {
    margin-top: var(--space-2);
  }
</style>
