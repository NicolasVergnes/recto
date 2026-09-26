<script lang="ts">
  import { RepoError } from '$lib/db/errors'
  import { parseOcclusion, serializeOcclusion, type Occlusion } from '$lib/domain/occlusion'
  import { imageRefs, imageTag } from '$lib/domain/text'
  import { t } from '$lib/i18n'
  import { mediaKind } from '$lib/media/mime'
  import { addMediaFile, detectMime } from '$lib/media/store'
  import { mediaUrl } from '$lib/media/url'
  import { toast } from '$lib/state/toast.svelte'
  import { errorMessage } from '../errors'
  import Icon from '../Icon.svelte'
  import OcclusionCanvas from './OcclusionCanvas.svelte'
  import OcclusionMasks from './OcclusionMasks.svelte'

  interface Props {
    /** Field 0 of the note: `<img src="…" alt="…">`. */
    image: string
    /** Field 1 of the note: the masks JSON. */
    masks: string
    /** Lowest group number for a new mask (above the groups the note was loaded with). */
    firstGroup?: number
  }
  let { image = $bindable(), masks = $bindable(), firstGroup = 1 }: Props = $props()

  const occlusion = $derived(parseOcclusion(masks))
  const ref = $derived(imageRefs(image)[0])
  let url = $state<string | null>(null)
  let selected = $state(-1)
  let fileInput: HTMLInputElement | undefined = $state()

  $effect(() => {
    const name = ref?.name
    url = null
    if (!name) return
    let cancelled = false
    void mediaUrl(name).then((u) => {
      if (!cancelled) url = u
    })
    return () => {
      cancelled = true
    }
  })

  function commit(next: Occlusion) {
    masks = serializeOcclusion(next)
  }

  /** Stores the picked image like any field image (resized, deduplicated); masks are kept. */
  async function useFile(file: File | undefined) {
    if (!file) return
    try {
      if (mediaKind(detectMime(file, file.name)) !== 'image') throw new RepoError('mediaType')
      const media = await addMediaFile(file, file.name, Date.now())
      image = imageTag(media.name, ref?.alt ?? '')
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }
</script>

<div class="stack">
  <div>
    <button class="btn" type="button" onclick={() => fileInput?.click()}>
      <Icon name="image" />
      {t(ref ? 'occlusion.changeImage' : 'occlusion.chooseImage')}
    </button>
    <input
      bind:this={fileInput}
      class="visually-hidden"
      type="file"
      accept="image/*"
      tabindex="-1"
      aria-label={t('occlusion.chooseImage')}
      onchange={(e) => {
        const file = e.currentTarget.files?.[0]
        e.currentTarget.value = ''
        void useFile(file)
      }}
    />
  </div>

  {#if url}
    <p class="muted small">{t('occlusion.drawHelp')}</p>
    <OcclusionCanvas
      {url}
      alt={ref?.alt ?? ''}
      {occlusion}
      {firstGroup}
      bind:selected
      onchange={commit}
      onfile={(file) => void useFile(file)}
    />
  {:else if ref}
    <p class="muted">{t('media.missing', { name: ref.name })}</p>
  {:else}
    <p class="muted">{t('occlusion.noImage')}</p>
  {/if}

  <OcclusionMasks {occlusion} {firstGroup} bind:selected onchange={commit} />
</div>
