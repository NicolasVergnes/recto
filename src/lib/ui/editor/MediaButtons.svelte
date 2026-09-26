<script lang="ts">
  import { t } from '$lib/i18n'
  import Icon from '$lib/ui/Icon.svelte'
  import AudioRecorder from './AudioRecorder.svelte'

  interface Props {
    /** Cloze note: "make a cloze" wraps the selection. */
    cloze: boolean
    onfiles: (files: readonly File[]) => void
    onmakecloze: () => void
  }
  let { cloze, onfiles, onmakecloze }: Props = $props()
  let imageInput: HTMLInputElement | undefined = $state()
  let audioInput: HTMLInputElement | undefined = $state()

  function onPicked(e: Event & { currentTarget: HTMLInputElement }) {
    const files = e.currentTarget.files ? Array.from(e.currentTarget.files) : []
    e.currentTarget.value = ''
    onfiles(files)
  }
</script>

<div class="row" role="group" aria-label={t('editor.media')}>
  <button class="btn btn-sm" type="button" onclick={() => imageInput?.click()}>
    <Icon name="image" />
    {t('editor.image')}
  </button>
  <button class="btn btn-sm" type="button" onclick={() => audioInput?.click()}>
    <Icon name="volume" />
    {t('editor.audio')}
  </button>
  <AudioRecorder onrecorded={(file) => onfiles([file])} />
  {#if cloze}
    <button class="btn btn-sm" type="button" onclick={onmakecloze}>
      {t('editor.makeCloze')}
    </button>
  {/if}
  <input
    bind:this={imageInput}
    class="visually-hidden"
    type="file"
    accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
    multiple
    tabindex="-1"
    aria-hidden="true"
    onchange={onPicked}
  />
  <input
    bind:this={audioInput}
    class="visually-hidden"
    type="file"
    accept="audio/*"
    multiple
    tabindex="-1"
    aria-hidden="true"
    onchange={onPicked}
  />
</div>
