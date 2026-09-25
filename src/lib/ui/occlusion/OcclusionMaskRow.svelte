<script lang="ts">
  import type { OcclusionMask } from '$lib/domain/occlusion'
  import { t } from '$lib/i18n'
  import Icon from '../Icon.svelte'

  interface Props {
    mask: OcclusionMask
    /** Position in the list (1-based), shown as « Masque i ». */
    position: number
    selected: boolean
    /** Id of the keyboard help text. */
    keysId: string
    onselect: () => void
    onkey: (e: KeyboardEvent) => void
    onupdate: (patch: Partial<OcclusionMask>) => void
    onremove: () => void
  }
  let { mask, position, selected, keysId, onselect, onkey, onupdate, onremove }: Props = $props()

  /** Card number: a whole number ≥ 1; anything else puts the current value back. */
  function setGroup(input: HTMLInputElement) {
    const n = Math.round(input.valueAsNumber)
    input.value = String(Number.isFinite(n) && n >= 1 ? n : mask.n)
    if (Number.isFinite(n) && n >= 1 && n !== mask.n) onupdate({ n })
  }

  /** Enter commits the field instead of submitting the whole note (Ctrl+Entrée does). */
  function onEnter(e: KeyboardEvent, commit: () => void) {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return
    e.preventDefault()
    commit()
  }
</script>

<li class="mask" class:selected>
  <button
    class="btn btn-sm"
    type="button"
    aria-pressed={selected}
    aria-describedby={keysId}
    onclick={onselect}
    onkeydown={onkey}
  >
    {t('occlusion.mask', { i: position, n: mask.n })}
  </button>
  <label>
    <span
      >{t('occlusion.group')}<span class="visually-hidden">
        · {t('occlusion.ofMask', { n: position })}</span
      ></span
    >
    <input
      type="number"
      min="1"
      step="1"
      value={mask.n}
      onchange={(e) => setGroup(e.currentTarget)}
      onkeydown={(e) => onEnter(e, () => setGroup(e.currentTarget))}
    />
  </label>
  <label class="label">
    <span
      >{t('occlusion.label')}<span class="visually-hidden">
        · {t('occlusion.ofMask', { n: position })}</span
      ></span
    >
    <input
      type="text"
      value={mask.label ?? ''}
      onchange={(e) => onupdate({ label: e.currentTarget.value })}
      onkeydown={(e) => onEnter(e, () => onupdate({ label: e.currentTarget.value }))}
    />
  </label>
  <button class="btn btn-sm btn-ghost" type="button" onclick={onremove}>
    <Icon name="trash" />
    <span class="visually-hidden">{t('occlusion.delete', { n: position })}</span>
  </button>
</li>

<style>
  .mask {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .mask.selected {
    border-color: var(--focus);
  }

  label {
    display: grid;
    gap: var(--space-1);
    font-size: 0.875rem;
  }

  input[type='number'] {
    width: 5rem;
  }

  .label {
    flex: 1 1 10rem;
  }
</style>
