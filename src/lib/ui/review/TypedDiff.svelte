<script lang="ts">
  import type { DiffPart } from '$lib/domain/typed'
  import { t } from '$lib/i18n'

  interface Props {
    parts: readonly DiffPart[]
    typed: string
  }
  let { parts, typed }: Props = $props()
  const exact = $derived(parts.every((p) => p.kind === 'same'))
</script>

<div class="typed" aria-live="polite">
  <p class="small muted">{t('review.yourAnswer')}</p>
  {#if typed.trim() === ''}
    <p class="muted">{t('review.noTypedAnswer')}</p>
  {:else}
    <p class="diff">
      {#each parts as part, i (i)}<span class={part.kind}>{part.text}</span>{/each}
    </p>
    <p class="small verdict">{t(exact ? 'review.typedExact' : 'review.typedDiff')}</p>
  {/if}
</div>

<style>
  .typed {
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
  }

  .typed p {
    margin: 0;
  }

  .diff {
    font-family: ui-monospace, monospace;
    font-size: 1.1rem;
    overflow-wrap: anywhere;
  }

  .same {
    color: var(--rate-good-text);
  }

  .wrong {
    color: var(--rate-again-text);
    text-decoration: line-through;
  }

  .missing {
    color: var(--text-2);
    text-decoration: underline dotted;
  }
</style>
