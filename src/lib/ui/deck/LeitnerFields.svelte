<script lang="ts">
  import type { LeitnerSettings } from '$lib/domain/types'
  import { t } from '$lib/i18n'

  interface Props {
    leitner: LeitnerSettings
  }
  let { leitner = $bindable() }: Props = $props()
  const id = $props.id()
</script>

<fieldset class="stack">
  <legend>{t('deckSettings.leitnerTitle')}</legend>
  <label class="check">
    <input type="radio" name={`${id}-lmode`} value="interval" bind:group={leitner.mode} />
    {t('scheduler.leitnerInterval')}
  </label>
  <label class="check">
    <input type="radio" name={`${id}-lmode`} value="calendar" bind:group={leitner.mode} />
    {t('scheduler.leitnerCalendar')}
  </label>
  {#if leitner.mode === 'calendar'}
    <p class="notice notice-warning small">{t('deckSettings.calendarWarning')}</p>
  {:else}
    <div class="intervals" role="group" aria-label={t('deckSettings.intervals')}>
      {#each leitner.intervals as _, i (i)}
        <div class="field">
          <label for={`${id}-iv-${i}`}>{t('scheduler.box', { n: i + 1 })}</label>
          <input
            id={`${id}-iv-${i}`}
            type="number"
            min="1"
            max="36500"
            bind:value={leitner.intervals[i]}
            required
          />
        </div>
      {/each}
    </div>
    <p class="muted small">{t('deckSettings.intervalsHelp')}</p>
  {/if}
  <label class="check">
    <input type="checkbox" bind:checked={leitner.alternateSides} />
    {t('scheduler.alternateSides')}
  </label>
  <p class="muted small">{t('deckSettings.alternateHelp')}</p>
  <label class="check">
    <input type="checkbox" bind:checked={leitner.allowSure} />
    {t('deckSettings.allowSure')}
  </label>
</fieldset>

<style>
  fieldset {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-3);
    margin: 0;
  }

  legend {
    font-weight: 600;
    padding: 0 var(--space-1);
  }

  .intervals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
    gap: var(--space-2);
  }
</style>
