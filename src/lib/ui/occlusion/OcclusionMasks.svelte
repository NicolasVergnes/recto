<script lang="ts">
  import {
    addMask,
    moveMask,
    occlusionGroups,
    removeMask,
    resizeMask,
    updateMask,
    type Occlusion,
    type OcclusionMode,
  } from '$lib/domain/occlusion'
  import { t } from '$lib/i18n'
  import Icon from '../Icon.svelte'

  interface Props {
    occlusion: Occlusion
    selected: number
    onchange: (next: Occlusion) => void
  }
  let { occlusion, selected = $bindable(), onchange }: Props = $props()

  const uid = $props.id()
  const STEP = 0.01
  const ARROWS: Partial<Record<string, readonly [number, number]>> = {
    ArrowLeft: [-STEP, 0],
    ArrowRight: [STEP, 0],
    ArrowUp: [0, -STEP],
    ArrowDown: [0, STEP],
  }
  const cards = $derived(occlusionGroups(occlusion).length)
  const MODES: { value: OcclusionMode; label: 'occlusion.hideAll' | 'occlusion.hideOne' }[] = [
    { value: 'hideAll', label: 'occlusion.hideAll' },
    { value: 'hideOne', label: 'occlusion.hideOne' },
  ]

  function add() {
    // Each new mask is offset a little so that several keyboard-added masks stay visible.
    const k = occlusion.masks.length % 5
    const next = addMask(occlusion, { x: 0.3 + k * 0.05, y: 0.3 + k * 0.05, w: 0.2, h: 0.2 })
    onchange(next)
    selected = next.masks.length - 1
  }

  function remove(index: number) {
    onchange(removeMask(occlusion, index))
    selected = Math.min(index, occlusion.masks.length - 2)
  }

  /** Arrows move the mask, Shift + arrows resize it, Delete removes it. */
  function onKeydown(e: KeyboardEvent, index: number) {
    const mask = occlusion.masks[index]
    if (!mask) return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      remove(index)
      return
    }
    const d = ARROWS[e.key]
    if (!d) return
    e.preventDefault()
    const [dx, dy] = d
    const next = e.shiftKey ? resizeMask(mask, dx, dy) : moveMask(mask, dx, dy)
    selected = index
    onchange(updateMask(occlusion, index, next))
  }
</script>

<fieldset class="masks stack">
  <legend>{t('occlusion.masks')} · {t('occlusion.cardCount', { n: cards })}</legend>
  {#if occlusion.masks.length === 0}
    <p class="muted small">{t('occlusion.noMask')}</p>
  {:else}
    <p class="muted small" id="{uid}-keys">{t('occlusion.keyboardHelp')}</p>
    <ol class="list">
      {#each occlusion.masks as m, i (i)}
        <li class="mask" class:selected={i === selected}>
          <button
            class="btn btn-sm"
            type="button"
            aria-pressed={i === selected}
            aria-describedby="{uid}-keys"
            onclick={() => (selected = i)}
            onkeydown={(e) => onKeydown(e, i)}
          >
            {t('occlusion.mask', { n: i + 1 })}
          </button>
          <label>
            <span>{t('occlusion.group')}</span>
            <input
              type="number"
              min="1"
              step="1"
              value={m.n}
              onchange={(e) =>
                onchange(updateMask(occlusion, i, { n: e.currentTarget.valueAsNumber }))}
            />
          </label>
          <label class="label">
            <span>{t('occlusion.label')}</span>
            <input
              type="text"
              value={m.label ?? ''}
              onchange={(e) => onchange(updateMask(occlusion, i, { label: e.currentTarget.value }))}
            />
          </label>
          <button class="btn btn-sm btn-ghost" type="button" onclick={() => remove(i)}>
            <Icon name="trash" />
            <span class="visually-hidden">{t('occlusion.delete', { n: i + 1 })}</span>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
  <div>
    <button class="btn btn-sm" type="button" onclick={add}>
      <Icon name="plus" />
      {t('occlusion.addMask')}
    </button>
  </div>
  <fieldset class="modes">
    <legend class="small">{t('occlusion.mode')}</legend>
    {#each MODES as mode (mode.value)}
      <label class="radio">
        <input
          type="radio"
          name="{uid}-mode"
          value={mode.value}
          checked={occlusion.mode === mode.value}
          onchange={() => onchange({ ...occlusion, mode: mode.value })}
        />
        {t(mode.label)}
      </label>
    {/each}
  </fieldset>
</fieldset>

<style>
  .list {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

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

  .radio {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 44px;
  }
</style>
