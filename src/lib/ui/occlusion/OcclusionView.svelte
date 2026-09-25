<script lang="ts">
  import type { OcclusionCard } from '$lib/domain/notes'
  import { occlusionGroups } from '$lib/domain/occlusion'
  import { t } from '$lib/i18n'
  import { mediaUrl } from '$lib/media/url'

  interface Props {
    occlusion: OcclusionCard
    /** After the reveal the target area is uncovered (outlined); other masks stay in place. */
    revealed: boolean
  }
  let { occlusion, revealed }: Props = $props()

  let url = $state<string | null>(null)
  let missing = $state(false)

  $effect(() => {
    const name = occlusion.image
    url = null
    missing = !name
    if (!name) return
    let cancelled = false
    void mediaUrl(name).then((u) => {
      if (cancelled) return
      url = u
      missing = !u
    })
    return () => {
      cancelled = true
    }
  })

  // hideAll: every mask is drawn and the target is highlighted; hideOne: only the target.
  const shown = $derived(
    occlusion.masks.filter((m) => occlusion.mode === 'hideAll' || m.n === occlusion.target),
  )
  const groups = $derived(occlusionGroups(occlusion))
  const position = $derived(groups.indexOf(occlusion.target) + 1)
</script>

<figure class="occlusion">
  {#if url}
    <div class="frame">
      <img src={url} alt={occlusion.alt} draggable="false" />
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {#each shown as m, i (i)}
          <rect
            x={m.x}
            y={m.y}
            width={m.w}
            height={m.h}
            class:target={m.n === occlusion.target}
            class:open={revealed && m.n === occlusion.target}
          />
        {/each}
      </svg>
    </div>
  {:else if missing}
    <p class="missing">
      {occlusion.image ? t('media.missing', { name: occlusion.image }) : t('occlusion.noImage')}
    </p>
  {/if}
  <figcaption class="visually-hidden">
    {t('occlusion.target', { n: Math.max(1, position), total: groups.length })}
  </figcaption>
</figure>

<style>
  .occlusion {
    margin: 0;
    text-align: center;
  }

  .frame {
    position: relative;
    display: inline-block;
    max-width: 100%;
    line-height: 0;
  }

  img {
    display: block;
    max-width: 100%;
    max-height: 70dvh;
    height: auto;
    user-select: none;
  }

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  /* Fixed colours: masks sit on the image, whatever the theme (Anki's palette). The target
     also differs by its thicker outline, not only by its colour. */
  rect {
    fill: #ffeba2;
    stroke: #212121;
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }

  rect.target {
    fill: #ff8e8e;
    stroke-width: 3px;
  }

  rect.open {
    fill: transparent;
    stroke: #d6332a;
    stroke-width: 3px;
  }

  .missing {
    display: inline-block;
    padding: var(--space-3);
    border: 1px dashed var(--border);
    color: var(--text-2);
    font-size: 0.875rem;
  }
</style>
