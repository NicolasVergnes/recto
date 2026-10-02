<script lang="ts">
  import { cardOrds, renderCard } from '$lib/domain/notes'
  import type { ModelType } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import TileFace from '../browser/TileFace.svelte'

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

<!-- Each card as the mosaic shows it: question and answer in two faces of the same size. -->
<section class="stack" aria-labelledby="preview-title">
  <h2 id="preview-title">{t('editor.preview', { n: cards.length })}</h2>
  {#each cards as card, i (i)}
    <article class="preview">
      <p class="muted small">{t('editor.cardN', { n: i + 1 })}</p>
      <div class="faces">
        <div class="card-surface face">
          <p class="muted small label" aria-hidden="true">{t('editor.previewQuestion')}</p>
          <div class="body"><TileFace rendered={card} side="front" /></div>
        </div>
        <div class="card-surface face">
          <p class="muted small label" aria-hidden="true">{t('editor.previewAnswer')}</p>
          <div class="body"><TileFace rendered={card} side="back" /></div>
        </div>
      </div>
    </article>
  {/each}
</section>

<style>
  .preview {
    display: grid;
    gap: var(--space-1);
  }

  .preview > p {
    margin: 0;
  }

  .faces {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
    gap: var(--space-2);
  }

  .face {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    height: 15rem;
    padding: var(--space-2) var(--space-3);
    gap: var(--space-1);
    --card-font: 1.05rem;
  }

  .label {
    margin: 0;
  }

  .body {
    flex: 1;
    min-height: 0;
  }
</style>
