<script lang="ts">
  import { t } from '$lib/i18n'
</script>

<!-- Formulas are an occasional need: a collapsed line, reachable by keyboard, until asked for. -->
<details>
  <summary class="muted small">{t('editor.mathHelp')}</summary>
  <ul class="muted small">
    <li>{t('editor.mathInline')}</li>
    <li>{t('editor.mathDisplay')}</li>
    <li>{t('editor.mathAnki')}</li>
  </ul>
  <p class="muted small">{t('editor.mathPreview')}</p>
</details>

<style>
  summary {
    cursor: pointer;
    line-height: 2.75rem;
  }

  ul {
    margin: 0 0 var(--space-2);
    padding-left: var(--space-5);
  }

  p {
    margin: 0;
  }
</style>
