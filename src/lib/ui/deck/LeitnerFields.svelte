<script lang="ts">
  import type { LeitnerSettings } from '$lib/domain/types'
  import { t } from '$lib/i18n'

  interface Props {
    leitner: LeitnerSettings
  }
  let { leitner = $bindable() }: Props = $props()
</script>

<fieldset class="stack">
  <legend>{t('deckSettings.leitnerTitle')}</legend>
  <!-- M19: the intervals belong to the box (7, 5 or « Ma boîte »), not to the deck. -->
  <ol class="intervals" aria-label={t('deckSettings.intervals')}>
    {#each leitner.intervals as days, i (i)}
      <li>
        <span class="muted small">{t('scheduler.box', { n: i + 1 })}</span>
        <strong class="tabular">{t('deckSettings.boxDays', { n: days })}</strong>
      </li>
    {/each}
  </ol>
  <p class="muted small">
    {t('deckSettings.intervalsHelp')}
    {t('deckSettings.customHelp')}
    <a href="#/settings">{t('deckSettings.customLink')}</a>
  </p>
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
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .intervals li {
    display: flex;
    flex-direction: column;
  }
</style>
