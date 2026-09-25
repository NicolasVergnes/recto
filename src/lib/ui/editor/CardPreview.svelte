<script lang="ts">
  import { cardOrds, renderCard } from '$lib/domain/notes'
  import type { ModelType } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import CardContent from '../CardContent.svelte'
  import OcclusionView from '../occlusion/OcclusionView.svelte'

  interface Props {
    modelType: ModelType
    fields: string[]
  }
  let { modelType, fields }: Props = $props()

  const cards = $derived(
    cardOrds(modelType, fields).map((ord) =>
      renderCard({ modelType, fields }, { ord, sideFlipped: false }),
    ),
  )
</script>

<section class="stack" aria-labelledby="preview-title">
  <h2 id="preview-title">{t('editor.preview', { n: cards.length })}</h2>
  {#each cards as card, i (i)}
    <article class="card-surface preview">
      <p class="muted small">{t('editor.cardN', { n: i + 1 })}</p>
      {#if card.occlusion}
        <CardContent html={card.question} />
        <div class="sides">
          <OcclusionView occlusion={card.occlusion} revealed={false} />
          <OcclusionView occlusion={card.occlusion} revealed={true} />
        </div>
        {#if card.answer}<CardContent html={card.answer} />{/if}
      {:else}
        <CardContent html={card.question} />
        <hr />
        <CardContent html={card.answer} />
      {/if}
      {#if card.extra}
        <div class="extra"><CardContent html={card.extra} /></div>
      {/if}
    </article>
  {/each}
</section>

<style>
  .preview {
    --card-font: 1.05rem;
  }

  .sides {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: var(--space-2);
  }

  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: var(--space-3) 0;
  }

  .extra {
    color: var(--text-2);
    --card-font: 0.95rem;
    margin-top: var(--space-2);
  }
</style>
