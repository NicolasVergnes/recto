<script lang="ts">
  import { APP_VERSION } from '$lib/config/app'
  import { t } from '$lib/i18n'
  import { SOURCES } from '../sources'
</script>

<section class="card-surface stack" aria-labelledby="about-title">
  <h2 id="about-title">{t('settings.about')}</h2>
  <p>{t('settings.version', { v: APP_VERSION })}</p>
  <p class="muted small">{t('settings.license')}</p>
  <p class="muted small">{t('settings.privacy')}</p>
  <details>
    <summary>{t('settings.sources')}</summary>
    <ul class="sources small">
      {#each SOURCES as source (source.label)}
        <li><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a></li>
      {/each}
    </ul>
  </details>
</section>

<style>
  .sources {
    padding-left: var(--space-5);
  }

  .sources li {
    margin-bottom: var(--space-1);
  }

  summary {
    cursor: pointer;
    min-height: 2.75rem;
    display: flex;
    align-items: center;
  }
</style>
