<script lang="ts">
  import * as repo from '$lib/db/repo'
  import type { Deck, DeckSettings } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import { parseSteps, validateFsrsSettings } from '$lib/scheduler/fsrs'
  import { endSession } from '$lib/state/session.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import FsrsFields from './deck/FsrsFields.svelte'
  import LeitnerFields from './deck/LeitnerFields.svelte'
  import SchedulerSwitch from './deck/SchedulerSwitch.svelte'
  import { errorMessage } from './errors'

  interface Props {
    deck: Deck
  }
  let { deck }: Props = $props()
  const id = $props.id()

  // svelte-ignore state_referenced_locally
  let settings = $state(structuredClone(deck.settings))
  // svelte-ignore state_referenced_locally
  let learningText = $state(deck.settings.fsrs.learningSteps.join(' '))
  // svelte-ignore state_referenced_locally
  let relearningText = $state(deck.settings.fsrs.relearningSteps.join(' '))
  let busy = $state(false)

  const learningSteps = $derived(parseSteps(learningText))
  const relearningSteps = $derived(parseSteps(relearningText))

  /** The single save path: validation, write, end of the review session (new settings). */
  async function persist(next: DeckSettings, message: string): Promise<boolean> {
    if (validateFsrsSettings(next.fsrs).length > 0) {
      toast(t('deckSettings.invalid'), 'error')
      return false
    }
    busy = true
    try {
      await repo.updateDeck(deck.id, { settings: next }, Date.now())
      endSession()
      toast(message)
      return true
    } catch (err) {
      toast(errorMessage(err), 'error')
      return false
    } finally {
      busy = false
    }
  }

  async function save(e: SubmitEvent) {
    e.preventDefault()
    if (!learningSteps || !relearningSteps) return
    // Plain copy: $state proxies cannot be stored in IndexedDB.
    const plain = $state.snapshot(settings)
    const fsrs = {
      ...plain.fsrs,
      learningSteps: [...learningSteps],
      relearningSteps: [...relearningSteps],
    }
    await persist({ ...plain, fsrs }, t('deckSettings.saved'))
  }

  /**
   * Optimizer (03 §2.4): only the parameters change in the saved settings; the form follows so
   * that a later « Enregistrer » keeps them. Due dates already set are not recomputed.
   */
  async function applyParams(params: number[] | null): Promise<boolean> {
    const saved = $state.snapshot(deck.settings)
    const next = { ...saved, fsrs: { ...saved.fsrs, params } }
    const ok = await persist(next, t(params ? 'optimizer.applied' : 'optimizer.resetDone'))
    if (ok) settings.fsrs.params = params
    return ok
  }
</script>

<section class="card-surface stack" aria-labelledby={`${id}-title`}>
  <h2 id={`${id}-title`}>{t('deckSettings.title')}</h2>

  <SchedulerSwitch {deck} />

  <form class="stack" onsubmit={save}>
    <div class="grid">
      <div class="field">
        <label for={`${id}-new`}>{t('deckSettings.newPerDay')}</label>
        <input
          id={`${id}-new`}
          type="number"
          min="0"
          max="9999"
          bind:value={settings.newPerDay}
          required
        />
      </div>
      <div class="field">
        <label for={`${id}-rev`}>{t('deckSettings.reviewsPerDay')}</label>
        <input
          id={`${id}-rev`}
          type="number"
          min="0"
          max="99999"
          bind:value={settings.reviewsPerDay}
          required
        />
      </div>
      <div class="field">
        <label for={`${id}-order`}>{t('deckSettings.newOrder')}</label>
        <select id={`${id}-order`} bind:value={settings.newOrder}>
          <option value="added">{t('deckSettings.orderAdded')}</option>
          <option value="random">{t('deckSettings.orderRandom')}</option>
        </select>
      </div>
    </div>
    <label class="check"
      ><input type="checkbox" bind:checked={settings.typedAnswer} />
      {t('deckSettings.typedAnswer')}</label
    >
    <label class="check"
      ><input type="checkbox" bind:checked={settings.autoplayAudio} />
      {t('deckSettings.autoplay')}</label
    >
    <label class="check"
      ><input type="checkbox" bind:checked={settings.burySiblings} />
      {t('deckSettings.bury')}</label
    >

    {#if deck.scheduler === 'fsrs'}
      <FsrsFields
        {deck}
        bind:fsrs={settings.fsrs}
        bind:learningText
        bind:relearningText
        onApplyParams={applyParams}
      />
    {:else}
      <LeitnerFields bind:leitner={settings.leitner} />
    {/if}

    <div class="row">
      <button
        class="btn btn-primary"
        type="submit"
        disabled={busy || !learningSteps || !relearningSteps}
      >
        {t('common.save')}
      </button>
    </div>
  </form>
</section>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: var(--space-3);
  }
</style>
