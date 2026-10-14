<script lang="ts">
  import OcclusionEditor from '../occlusion/OcclusionEditor.svelte'
  import type { NoteDraft } from './draft.svelte'

  interface Props {
    /** Edited in place: the image and masks of an occlusion note, or of each image field. */
    draft: NoteDraft
  }
  let { draft }: Props = $props()
</script>

{#if draft.modelType === 'image_occlusion'}
  <OcclusionEditor
    bind:image={() => draft.fields[0] ?? '', (v) => (draft.fields[0] = v)}
    bind:masks={() => draft.fields[1] ?? '', (v) => (draft.fields[1] = v)}
    firstGroup={draft.nextGroup(0)}
  />
{/if}
<!-- M14: each image field asked by an occlusion card of a custom type, under its name. -->
{#each draft.imageFields as i (i)}
  <fieldset class="stack">
    <legend>{draft.noteType?.fields[i]}</legend>
    <OcclusionEditor
      bind:image={() => draft.fields[i] ?? '', (v) => (draft.fields[i] = v)}
      bind:masks={() => draft.masks[i] ?? '', (v) => (draft.masks[i] = v)}
      firstGroup={draft.nextGroup(i)}
    />
  </fieldset>
{/each}
