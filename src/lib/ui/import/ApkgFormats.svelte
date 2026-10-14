<script lang="ts">
  import type { packageFormats } from '$lib/import/apkg'
  import { t } from '$lib/i18n'
  import { MODEL_LABEL } from '../model-labels'

  interface Props {
    formats: ReturnType<typeof packageFormats>
    /** Format keys left for later (M17): their new cards wait in the decks the import fills. */
    paused: string[]
    newByFormat: boolean
  }
  let { formats, paused = $bindable(), newByFormat = $bindable() }: Props = $props()
  const id = $props.id()

  function toggle(key: string, now: boolean) {
    paused = now ? paused.filter((k) => k !== key) : [...paused, key]
  }
</script>

<!-- One format has nothing to choose: it comes at once, at the deck's pace. -->
{#if formats.length > 1}
  <fieldset class="stack" aria-describedby="{id}-help">
    <legend>{t('apkg.formats')}</legend>
    <p id="{id}-help" class="muted small">{t('apkg.formatsHelp')}</p>
    {#each formats as format (format.key)}
      <label class="check">
        <input
          type="checkbox"
          checked={!paused.includes(format.key)}
          onchange={(e) => toggle(format.key, e.currentTarget.checked)}
        />
        {format.model} · {format.card ?? t(MODEL_LABEL[format.modelType])}
      </label>
    {/each}
    <label class="check">
      <input type="checkbox" bind:checked={newByFormat} />
      {t('deckSettings.newByFormat')}
    </label>
  </fieldset>
{/if}

<style>
  fieldset {
    border: none;
    margin: 0;
    padding: 0;
  }

  legend {
    font-weight: 600;
    font-size: 0.9rem;
  }

  p {
    margin: 0;
  }
</style>
