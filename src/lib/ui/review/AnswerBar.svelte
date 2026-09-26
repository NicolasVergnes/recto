<script lang="ts">
  import type { Rating, SchedulerKind } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import type { PreviewItem } from '$lib/scheduler'
  import RatingButtons from './RatingButtons.svelte'

  interface Props {
    revealed: boolean
    /** Typed-answer deck: a text field comes before "Show answer". */
    typedMode: boolean
    typed: string
    kind: SchedulerKind
    ratings: readonly Rating[]
    previews: Partial<Record<Rating, PreviewItem>>
    suggested: Rating | null
    busy: boolean
    /** "Show answer", for the keyboard shortcuts (Enter/Space on other buttons stay native). */
    showButton?: HTMLButtonElement | undefined
    onreveal: () => void
    onrate: (rating: Rating) => void
  }
  let {
    revealed,
    typedMode,
    typed = $bindable(),
    kind,
    ratings,
    previews,
    suggested,
    busy,
    showButton = $bindable(),
    onreveal,
    onrate,
  }: Props = $props()
  let typedInput: HTMLInputElement | undefined = $state()
  let ratingButtons: RatingButtons | undefined = $state()

  /** A new card: focus the typed-answer field or "Show answer" (svelte5-conventions §5). */
  export function focusQuestion() {
    const target = typedMode ? typedInput : showButton
    target?.focus()
  }

  /** After "Show answer": focus the first rating button. */
  export function focusRatings() {
    ratingButtons?.focusFirst()
  }

  function onTypedKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !revealed) {
      e.preventDefault()
      onreveal()
    }
  }
</script>

<footer class="actions">
  {#if !revealed}
    {#if typedMode}
      <label class="visually-hidden" for="typed">{t('review.typedLabel')}</label>
      <input
        id="typed"
        bind:this={typedInput}
        bind:value={typed}
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder={t('review.typedPlaceholder')}
        onkeydown={onTypedKeydown}
      />
    {/if}
    <button
      bind:this={showButton}
      class="btn btn-primary btn-block show"
      type="button"
      onclick={onreveal}
    >
      {t('review.showAnswer')}
    </button>
  {:else}
    <RatingButtons
      bind:this={ratingButtons}
      {kind}
      {ratings}
      {previews}
      {suggested}
      disabled={busy}
      {onrate}
    />
  {/if}
  <p class="muted small shortcuts">
    {t(revealed ? 'review.shortcutsAnswer' : 'review.shortcutsQuestion', { n: ratings.length })}
  </p>
</footer>

<style>
  .actions {
    position: sticky;
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-3) calc(var(--space-3) + env(safe-area-inset-bottom));
    background: var(--bg);
  }

  .show {
    min-height: 3.5rem;
    font-size: 1.05rem;
  }

  .shortcuts {
    margin: 0;
    text-align: center;
  }

  @media (max-width: 899px) {
    .shortcuts {
      display: none;
    }
  }
</style>
