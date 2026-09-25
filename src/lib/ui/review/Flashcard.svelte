<script lang="ts">
  import type { RenderedCard } from '$lib/domain/notes'
  import type { DiffPart } from '$lib/domain/typed'
  import { t } from '$lib/i18n'
  import CardContent from '$lib/ui/CardContent.svelte'
  import Icon from '$lib/ui/Icon.svelte'
  import OcclusionView from '$lib/ui/occlusion/OcclusionView.svelte'
  import TypedDiff from './TypedDiff.svelte'

  interface Props {
    rendered: RenderedCard
    revealed: boolean
    flagged: boolean
    /** Typed answer compared with the expected one, after the reveal (typed-answer decks). */
    diff: readonly DiffPart[] | null
    typed: string
  }
  let { rendered, revealed, flagged, diff, typed }: Props = $props()
  let answer: HTMLDivElement | undefined = $state()

  // A tall occlusion image can push the answer under the rating bar: bring it into view.
  $effect(() => {
    if (revealed && rendered.occlusion) answer?.scrollIntoView({ block: 'nearest' })
  })
</script>

<!--
  The card being reviewed. Every note type renders here: a type with its own view plugs its
  renderer in place of the sides below, keeping the badges and the P1 rule.
-->
<article class="card-surface flashcard" aria-label={t('review.cardLabel')}>
  {#if rendered.flipped}
    <p class="badge small" title={t('review.flippedHelp')}>↔ {t('review.flipped')}</p>
  {/if}
  {#if flagged}
    <p class="badge small flag"><Icon name="flag" size={14} /> {t('review.flag')}</p>
  {/if}
  {#if rendered.occlusion}
    <!-- Image occlusion: header, then the image whose target mask opens on reveal. -->
    {#if rendered.question}
      <div class="side question"><CardContent html={rendered.question} /></div>
    {/if}
    <OcclusionView occlusion={rendered.occlusion} {revealed} />
  {:else if !revealed || !rendered.answerReplacesQuestion}
    <div class="side question"><CardContent html={rendered.question} /></div>
  {/if}
  <!-- P1: the answer is not in the DOM before the user asks for it. -->
  {#if revealed}
    {#if rendered.occlusion}
      {#if rendered.answer}
        <div class="side answer" bind:this={answer}><CardContent html={rendered.answer} /></div>
      {/if}
    {:else if rendered.answerReplacesQuestion}
      <div class="side"><CardContent html={rendered.answer} /></div>
    {:else}
      <hr />
      <div class="side answer"><CardContent html={rendered.answer} /></div>
    {/if}
    {#if rendered.extra}
      <div class="extra"><CardContent html={rendered.extra} /></div>
    {/if}
    {#if diff}
      <TypedDiff parts={diff} {typed} />
    {/if}
  {/if}
</article>

<style>
  .flashcard {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    justify-content: center;
    text-align: center;
    min-height: 40vh;
  }

  .side {
    width: 100%;
  }

  hr {
    width: 100%;
    border: none;
    border-top: 1px solid var(--border);
    margin: 0;
  }

  .extra {
    color: var(--text-2);
    --card-font: calc(1rem * var(--font-scale));
  }

  .badge {
    align-self: center;
    margin: 0;
    padding: 0 var(--space-2);
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--text);
  }

  .badge.flag {
    background: var(--danger-soft);
  }
</style>
