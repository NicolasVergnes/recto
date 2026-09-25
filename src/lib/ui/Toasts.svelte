<script lang="ts">
  import { t } from '$lib/i18n'
  import { dismissToast, toasts } from '$lib/state/toast.svelte'
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts as item (item.id)}
    <div class="toast" class:error={item.kind === 'error'}>
      <span>{item.text}</span>
      <button class="btn btn-ghost btn-sm" type="button" onclick={() => dismissToast(item.id)}>
        {t('common.close')}
      </button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    top: calc(var(--space-2) + env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: min(28rem, calc(100vw - 2rem));
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-1) var(--space-1) var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 4px solid var(--accent);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .toast.error {
    border-left-color: var(--danger);
  }
</style>
