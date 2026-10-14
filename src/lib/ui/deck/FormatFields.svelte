<script lang="ts">
  import * as repo from '$lib/db/repo'
  import { t } from '$lib/i18n'
  import { formatLabel } from '../format-labels'

  interface Props {
    deckId: string
    /** Formats whose new cards wait (M17); their started cards are still reviewed. */
    pausedFormats: string[]
    newByFormat: boolean
  }
  let { deckId, pausedFormats = $bindable(), newByFormat = $bindable() }: Props = $props()
  const id = $props.id()

  let formats = $state<repo.DeckFormat[]>([])
  $effect(() => {
    let cancelled = false
    void repo.deckFormats(deckId).then((f) => {
      if (!cancelled) formats = f
    })
    return () => {
      cancelled = true
    }
  })

  function toggle(key: string, introduce: boolean) {
    pausedFormats = introduce ? pausedFormats.filter((k) => k !== key) : [...pausedFormats, key]
  }
</script>

<!-- Only a deck with several formats has something to choose (one format: « Nouvelles / jour »). -->
{#if formats.length > 1}
  <fieldset class="stack" aria-describedby="{id}-help">
    <legend>{t('deckSettings.formats')}</legend>
    <p id="{id}-help" class="muted small">{t('deckSettings.formatsHelp')}</p>
    {#each formats as format (format.key)}
      <label class="check">
        <input
          type="checkbox"
          checked={!pausedFormats.includes(format.key)}
          onchange={(e) => toggle(format.key, e.currentTarget.checked)}
        />
        <span>
          {formatLabel(format)}
          <span class="muted small tabular">
            · {t('deckSettings.formatFresh', { n: format.fresh })} ·
            {t('deckSettings.formatStarted', { n: format.started })}</span
          >
        </span>
      </label>
    {/each}
    <label class="check">
      <input type="checkbox" bind:checked={newByFormat} aria-describedby="{id}-by-format" />
      {t('deckSettings.newByFormat')}
    </label>
    <p id="{id}-by-format" class="muted small">{t('deckSettings.newByFormatHelp')}</p>
  </fieldset>
{/if}
