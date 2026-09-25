<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    open: boolean
    title: string
    onclose: () => void
    children: Snippet
    actions?: Snippet
  }
  let { open, title, onclose, children, actions }: Props = $props()
  const id = $props.id()
  let dialog: HTMLDialogElement | undefined = $state()

  // Native <dialog>: focus trap, Escape and inert background come for free.
  $effect(() => {
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  })
</script>

<dialog bind:this={dialog} aria-labelledby={`${id}-title`} {onclose}>
  <h2 id={`${id}-title`}>{title}</h2>
  <div class="body">{@render children()}</div>
  {#if actions}
    <div class="actions">{@render actions()}</div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(32rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    padding: var(--space-5);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }

  dialog::backdrop {
    background: var(--overlay);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-5);
  }
</style>
