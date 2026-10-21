<script lang="ts" module>
  import type { RpkgDetails } from '$lib/db/export-rpkg'
  import type { MessageKey } from '$lib/i18n'

  /** Licences offered for a package: the text written in its manifest, and its label. */
  export const LICENCES: readonly { value: string; label: MessageKey }[] = [
    { value: '', label: 'rpkg.licenceNone' },
    { value: 'CC BY 4.0', label: 'rpkg.licenceBy' },
    { value: 'CC BY-SA 4.0', label: 'rpkg.licenceBySa' },
    { value: 'CC0 1.0', label: 'rpkg.licenceZero' },
    { value: 'Tous droits réservés', label: 'rpkg.licenceReserved' },
  ]

  /** What the fields hold: every one a string, empty when not given. */
  export type RpkgDraft = { [K in keyof RpkgDetails]-?: string }

  /** The details written in the manifest: empty fields left out. */
  export function rpkgDetails(draft: RpkgDraft, fallbackTitle: string): RpkgDetails {
    const details: RpkgDetails = { title: draft.title.trim() || fallbackTitle }
    for (const key of ['description', 'author', 'licence'] as const) {
      const value = draft[key].trim()
      if (value) details[key] = value
    }
    return details
  }
</script>

<script lang="ts">
  import { t } from '$lib/i18n'

  interface Props {
    draft: RpkgDraft
  }
  let { draft = $bindable() }: Props = $props()
  const id = $props.id()
</script>

<div class="stack">
  <p class="muted small">{t('rpkg.help')}</p>
  <div class="field">
    <label for={`${id}-title`}>{t('rpkg.title')}</label>
    <input id={`${id}-title`} type="text" bind:value={draft.title} />
  </div>
  <div class="field">
    <label for={`${id}-description`}>{t('rpkg.description')}</label>
    <textarea id={`${id}-description`} rows="2" bind:value={draft.description}></textarea>
  </div>
  <div class="field">
    <label for={`${id}-author`}>{t('rpkg.author')}</label>
    <input id={`${id}-author`} type="text" autocomplete="name" bind:value={draft.author} />
  </div>
  <div class="field">
    <label for={`${id}-licence`}>{t('rpkg.licence')}</label>
    <select id={`${id}-licence`} bind:value={draft.licence}>
      {#each LICENCES as licence (licence.value)}
        <option value={licence.value}>{t(licence.label)}</option>
      {/each}
    </select>
  </div>
</div>
