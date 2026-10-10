<script lang="ts">
  import type { FlipStyle, Theme } from '$lib/db/settings'
  import { t, type MessageKey } from '$lib/i18n'
  import {
    prefs,
    setDayStartHour,
    setFlipStyle,
    setFontScale,
    setSwipeGestures,
    setTheme,
  } from '$lib/state/prefs.svelte'

  interface Props {
    /** Global daily review limit, as loaded by the screen (which owns it). */
    globalReviews: number
    onsaveglobalreviews: (n: number) => void
  }
  let { globalReviews, onsaveglobalreviews }: Props = $props()

  const THEMES: { value: Theme; label: MessageKey }[] = [
    { value: 'system', label: 'settings.themeSystem' },
    { value: 'light', label: 'settings.themeLight' },
    { value: 'dark', label: 'settings.themeDark' },
  ]
  const FLIP_STYLES: { value: FlipStyle; label: MessageKey }[] = [
    { value: 'none', label: 'settings.flipNone' },
    { value: 'horizontal', label: 'settings.flipHorizontal' },
    { value: 'vertical', label: 'settings.flipVertical' },
    { value: 'fade', label: 'settings.flipFade' },
    { value: 'slide', label: 'settings.flipSlide' },
  ]
</script>

<section class="card-surface stack" aria-labelledby="display-title">
  <h2 id="display-title">{t('settings.display')}</h2>
  <fieldset>
    <legend>{t('settings.theme')}</legend>
    <div class="row">
      {#each THEMES as theme (theme.value)}
        <label class="check">
          <input
            type="radio"
            name="theme"
            value={theme.value}
            checked={prefs.theme === theme.value}
            onchange={() => setTheme(theme.value)}
          />
          {t(theme.label)}
        </label>
      {/each}
    </div>
  </fieldset>
  <div class="field">
    <label for="font-scale"
      >{t('settings.fontScale', { pct: Math.round(prefs.fontScale * 100) })}</label
    >
    <input
      id="font-scale"
      type="range"
      min="0.8"
      max="1.6"
      step="0.05"
      value={prefs.fontScale}
      onchange={(e) => setFontScale(Number(e.currentTarget.value))}
    />
  </div>
  <div class="field">
    <label for="day-start">{t('settings.dayStart')}</label>
    <select
      id="day-start"
      value={prefs.dayStartHour}
      onchange={(e) => setDayStartHour(Number(e.currentTarget.value))}
    >
      {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
        <option value={h}>{String(h).padStart(2, '0')}:00</option>
      {/each}
    </select>
    <p class="muted small">{t('settings.dayStartHelp')}</p>
  </div>
  <div class="field">
    <label for="global-reviews">{t('settings.globalReviews')}</label>
    <input
      id="global-reviews"
      type="number"
      min="0"
      max="99999"
      value={globalReviews}
      onchange={(e) => onsaveglobalreviews(Number(e.currentTarget.value))}
    />
    <p class="muted small">{t('settings.globalReviewsHelp')}</p>
  </div>
  <label class="check">
    <input
      type="checkbox"
      checked={prefs.swipeGestures}
      onchange={(e) => setSwipeGestures(e.currentTarget.checked)}
    />
    {t('settings.swipe')}
  </label>
  <fieldset>
    <legend>{t('settings.flipStyle')}</legend>
    <div class="row">
      {#each FLIP_STYLES as style (style.value)}
        <label class="check">
          <input
            type="radio"
            name="flip-style"
            value={style.value}
            checked={prefs.flipStyle === style.value}
            onchange={() => setFlipStyle(style.value)}
          />
          {t(style.label)}
        </label>
      {/each}
    </div>
    <p class="muted small">{t('settings.flipStyleHelp')}</p>
  </fieldset>
  <p class="muted small">{t('settings.language')}</p>
</section>

<style>
  fieldset {
    border: none;
    padding: 0;
    margin: 0;
  }

  legend {
    font-weight: 600;
    font-size: 0.9rem;
    margin-bottom: var(--space-1);
  }
</style>
