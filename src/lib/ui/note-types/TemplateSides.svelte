<script lang="ts">
  import type { EditedTemplate } from '$lib/domain/note-types'
  import { kindOf } from '$lib/domain/templates'
  import { t } from '$lib/i18n'

  interface Props {
    /** Edited in place (an entry of the draft). */
    template: EditedTemplate
    /** Field names of the type, for the source of a cloze or occlusion card. */
    fields: readonly string[]
    id: string
    /** A classic card asked both ways or one way (M16). */
    ontwoway: (twoWay: boolean) => void
  }
  let { template, fields, id, ontwoway }: Props = $props()
  const kind = $derived(kindOf(template))
</script>

{#if kind === 'classic'}
  <div class="field">
    <label class="check">
      <input
        type="checkbox"
        checked={!!template.twoWay}
        aria-describedby="{id}-two-way-help"
        onchange={(e) => ontwoway(e.currentTarget.checked)}
      />
      {t('noteTypes.twoWay')}
    </label>
    <p id="{id}-two-way-help" class="muted small">{t('noteTypes.twoWayHelp')}</p>
  </div>
  <div class="field">
    <label for="{id}-front">{t(template.twoWay ? 'noteTypes.face1' : 'noteTypes.question')}</label>
    <textarea id="{id}-front" class="code" rows="3" bind:value={template.front}></textarea>
  </div>
  <div class="field">
    <label for="{id}-back">{t(template.twoWay ? 'noteTypes.face2' : 'noteTypes.answer')}</label>
    <textarea id="{id}-back" class="code" rows="3" bind:value={template.back}></textarea>
  </div>
{:else}
  <div class="field">
    <label for="{id}-field">
      {t(kind === 'cloze' ? 'noteTypes.clozeField' : 'noteTypes.imageField')}
    </label>
    <select id="{id}-field" bind:value={template.field}>
      {#each fields as name (name)}
        <option value={name}>{name}</option>
      {/each}
    </select>
  </div>
  {#if kind === 'occlusion'}
    <div class="field">
      <label for="{id}-front">{t('noteTypes.header')}</label>
      <textarea id="{id}-front" class="code" rows="2" bind:value={template.front}></textarea>
    </div>
  {/if}
  <div class="field">
    <label for="{id}-back">{t('noteTypes.added')}</label>
    <textarea id="{id}-back" class="code" rows="2" bind:value={template.back}></textarea>
  </div>
  <label class="check">
    <input type="checkbox" bind:checked={template.single} />
    {t('noteTypes.single')}
  </label>
{/if}

<style>
  .code {
    font-family: ui-monospace, monospace;
    font-size: 0.9rem;
  }
</style>
