<script lang="ts">
  import { getSetting } from '$lib/db/settings'
  import { switchDeckModel } from '$lib/db/study'
  import { deckModel, LEITNER_PRESETS } from '$lib/domain/leitner'
  import { DECK_MODELS, type Deck, type DeckModel } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import { confirmAction } from '$lib/state/confirm.svelte'
  import { endSession } from '$lib/state/session.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import { errorMessage } from '../errors'
  import { deckModelLabel } from '../model-labels'

  interface Props {
    deck: Deck
  }
  let { deck }: Props = $props()
  const id = $props.id()

  const current = $derived(deckModel(deck))
  // svelte-ignore state_referenced_locally
  let model = $state<DeckModel>(deckModel(deck))
  let busy = $state(false)
  /** Compartments of « Ma boîte », in its name (M19). */
  let customBoxes = $state<number>(LEITNER_PRESETS.seven.length)
  void getSetting('leitnerCustom').then((box) => (customBoxes = box.length))

  /** 03 §4: conversion in one transaction, after confirmation. */
  async function changeModel() {
    if (model === current) return
    const message =
      model === 'fsrs'
        ? 'deckSettings.toFsrs'
        : current === 'fsrs'
          ? 'deckSettings.toLeitner'
          : 'deckSettings.toOtherBox'
    const ok = await confirmAction({
      title: t('deckSettings.switchTitle'),
      message: t(message),
      confirmLabel: t('deckSettings.switch'),
    })
    if (!ok) {
      model = current
      return
    }
    busy = true
    const boxToBox = model !== 'fsrs' && current !== 'fsrs'
    try {
      const n = await switchDeckModel(deck.id, model, Date.now())
      endSession()
      toast(boxToBox ? t('deckSettings.boxSwitched') : t('deckSettings.switched', { n }))
    } catch (err) {
      model = current
      toast(errorMessage(err), 'error')
    } finally {
      busy = false
    }
  }
</script>

<fieldset class="stack">
  <legend>{t('deckSettings.scheduler')}</legend>
  {#each DECK_MODELS as choice (choice)}
    <label class="check">
      <input type="radio" name={`${id}-scheduler`} value={choice} bind:group={model} />
      {deckModelLabel(choice, customBoxes)}
    </label>
  {/each}
  {#if model !== current}
    <div class="row">
      <button class="btn btn-primary btn-sm" type="button" disabled={busy} onclick={changeModel}>
        {t('deckSettings.switch')}
      </button>
    </div>
  {/if}
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
</style>
