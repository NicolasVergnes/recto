<script lang="ts">
  import { t } from '$lib/i18n'
  import Icon from '$lib/ui/Icon.svelte'

  interface Props {
    open: boolean
    canUndo: boolean
    hasCard: boolean
    flagged: boolean
    /** P7: retiring is locked until the card is well known (`canRetire`). */
    retireAllowed: boolean
    onundo: () => void
    onedit: () => void
    onsuspend: () => void
    onretire: () => void
    onflag: () => void
    oninfo: () => void
  }
  let {
    open = $bindable(),
    canUndo,
    hasCard,
    flagged,
    retireAllowed,
    onundo,
    onedit,
    onsuspend,
    onretire,
    onflag,
    oninfo,
  }: Props = $props()
</script>

<div class="menu">
  <button
    class="btn btn-ghost btn-sm"
    type="button"
    aria-expanded={open}
    aria-controls="review-menu"
    onclick={() => (open = !open)}
  >
    <Icon name="more" />
    <span class="visually-hidden">{t('review.more')}</span>
  </button>
  {#if open}
    <ul id="review-menu" class="menu-list card-surface">
      <li>
        <button type="button" disabled={!canUndo} onclick={onundo}>
          <Icon name="undo" />
          {t('review.undo')} <kbd>Ctrl+Z</kbd>
        </button>
      </li>
      <li>
        <button type="button" disabled={!hasCard} onclick={onedit}>
          <Icon name="edit" />
          {t('review.edit')} <kbd>E</kbd>
        </button>
      </li>
      <li>
        <button type="button" disabled={!hasCard} onclick={onsuspend}>
          <Icon name="pause" />
          {t('review.suspend')}
        </button>
      </li>
      <li>
        <button
          type="button"
          disabled={!hasCard || !retireAllowed}
          aria-describedby={retireAllowed ? undefined : 'retire-help'}
          title={retireAllowed ? undefined : t('review.retireLocked')}
          onclick={onretire}
        >
          <Icon name="archive" />
          {t('review.retire')}
        </button>
        {#if !retireAllowed}
          <p id="retire-help" class="small muted help">{t('review.retireLocked')}</p>
        {/if}
      </li>
      <li>
        <button type="button" disabled={!hasCard} onclick={onflag}>
          <Icon name="flag" />
          {t(flagged ? 'review.unflag' : 'review.flag')}
        </button>
      </li>
      <li>
        <button type="button" disabled={!hasCard} onclick={() => (oninfo(), (open = false))}>
          <Icon name="info" />
          {t('review.info')}
        </button>
      </li>
    </ul>
  {/if}
</div>

<style>
  .menu {
    position: relative;
  }

  .menu-list {
    position: absolute;
    right: 0;
    top: 100%;
    z-index: 20;
    min-width: 15rem;
    list-style: none;
    margin: var(--space-1) 0 0;
    padding: var(--space-1);
  }

  .menu-list button {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: 2.75rem;
    padding: var(--space-2);
    border: none;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
    border-radius: var(--radius);
    cursor: pointer;
  }

  .menu-list button:hover:not(:disabled) {
    background: var(--surface-2);
  }

  .menu-list button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .menu-list kbd {
    margin-left: auto;
  }

  .help {
    margin: 0 var(--space-2) var(--space-2);
  }
</style>
