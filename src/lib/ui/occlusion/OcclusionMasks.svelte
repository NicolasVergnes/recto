<script lang="ts">
  import { tick } from 'svelte'
  import {
    addMask,
    moveMask,
    nextMaskGroup,
    occlusionGroups,
    removeMask,
    resizeMask,
    updateMask,
    type Occlusion,
    type OcclusionMode,
  } from '$lib/domain/occlusion'
  import { t } from '$lib/i18n'
  import Icon from '../Icon.svelte'
  import OcclusionMaskRow from './OcclusionMaskRow.svelte'

  interface Props {
    occlusion: Occlusion
    firstGroup: number
    selected: number
    onchange: (next: Occlusion) => void
  }
  let { occlusion, firstGroup, selected = $bindable(), onchange }: Props = $props()

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
  let list: HTMLOListElement | undefined = $state()
  let addButton: HTMLButtonElement | undefined = $state()

  /** Keyboard path: the arrows act on the « Masque n » button, so focus goes there. */
  async function focusMask(index: number) {
    await tick()
    const buttons = list?.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')
    ;(buttons?.[index] ?? addButton)?.focus()
  }

  function add() {
    // Each new mask is offset a little so that several keyboard-added masks stay visible.
    const k = occlusion.masks.length % 5
    const rect = { x: 0.3 + k * 0.05, y: 0.3 + k * 0.05, w: 0.2, h: 0.2 }
    const next = addMask(occlusion, rect, Math.max(nextMaskGroup(occlusion), firstGroup))
    selected = next.masks.length - 1
    onchange(next)
    void focusMask(selected)
  }

  function remove(index: number) {
    // The prop follows `onchange` at once: compute the new selection from the length before.
    const last = occlusion.masks.length - 2
    onchange(removeMask(occlusion, index))
    selected = Math.min(index, last)
    void focusMask(selected)
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

<fieldset class="stack">
  <legend>{t('occlusion.masks')} · {t('occlusion.cardCount', { n: cards })}</legend>
  {#if occlusion.masks.length === 0}
    <p class="muted small">{t('occlusion.noMask')}</p>
  {:else}
    <p class="muted small" id="{uid}-keys">{t('occlusion.keyboardHelp')}</p>
    <ol class="list" bind:this={list}>
      {#each occlusion.masks as m, i (i)}
        <OcclusionMaskRow
          mask={m}
          position={i + 1}
          selected={i === selected}
          keysId="{uid}-keys"
          onselect={() => (selected = i)}
          onkey={(e) => onKeydown(e, i)}
          onupdate={(patch) => onchange(updateMask(occlusion, i, patch))}
          onremove={() => remove(i)}
        />
      {/each}
    </ol>
  {/if}
  <div>
    <button class="btn btn-sm" type="button" bind:this={addButton} onclick={add}>
      <Icon name="plus" />
      {t('occlusion.addMask')}
    </button>
  </div>
  <fieldset>
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

  .radio {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 44px;
  }
</style>
