<script lang="ts">
  import { live } from '$lib/db/live.svelte'
  import * as repo from '$lib/db/repo'
  import { getSetting, setSetting } from '$lib/db/settings'
  import { saveCustomBox } from '$lib/db/study'
  import {
    boxError,
    LEITNER_PRESETS,
    MAX_BOX_DAYS,
    MAX_BOXES,
    MIN_BOXES,
    type BoxError,
  } from '$lib/domain/leitner'
  import type { DeckModel } from '$lib/domain/types'
  import { t, type MessageKey } from '$lib/i18n'
  import { confirmAction } from '$lib/state/confirm.svelte'
  import { endSession } from '$lib/state/session.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import { errorMessage } from '../errors'
  import ModelSelect from '../ModelSelect.svelte'

  const id = $props.id()
  const ERRORS: Record<BoxError, MessageKey> = {
    count: 'errors.leitnerBox',
    days: 'settings.boxDaysInvalid',
    order: 'settings.boxOrder',
  }
  const COUNTS = Array.from({ length: MAX_BOXES - MIN_BOXES + 1 }, (_, i) => MIN_BOXES + i)

  let model = $state<DeckModel>('fsrs')
  /** « Ma boîte » being edited; `saved` is the stored one (its name gives its size). */
  let box = $state<number[]>([...LEITNER_PRESETS.seven])
  let saved = $state<number>(LEITNER_PRESETS.seven.length)
  let error = $state<BoxError | null>(null)
  let busy = $state(false)
  const decks = live(() => repo.listDecks(), [])
  const followers = $derived(
    decks.value.filter((d) => d.scheduler === 'leitner' && d.settings.leitner.model === 'custom')
      .length,
  )

  void Promise.all([getSetting('newDeckModel'), getSetting('leitnerCustom')]).then(([m, c]) => {
    model = m
    box = [...c]
    saved = c.length
  })

  async function saveModel(value: DeckModel) {
    await setSetting('newDeckModel', value)
    toast(t('settings.saved'))
  }

  /** More compartments: each new one lasts twice the last; fewer: the last ones go. */
  function resize(count: number) {
    while (box.length < count) box.push(Math.min(MAX_BOX_DAYS, (box.at(-1) ?? 1) * 2))
    box.length = count
    error = null
  }

  async function saveBox(e: SubmitEvent) {
    e.preventDefault()
    error = boxError(box)
    if (error) return
    if (
      followers > 0 &&
      !(await confirmAction({
        title: t('settings.boxFollowersTitle'),
        message: t('settings.boxFollowers', { n: followers }),
        confirmLabel: t('settings.saveBox'),
      }))
    )
      return
    busy = true
    try {
      await saveCustomBox($state.snapshot(box), Date.now())
      saved = box.length
      endSession()
      toast(t('settings.boxSaved'))
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      busy = false
    }
  }
</script>

<section class="card-surface stack" aria-labelledby="scheduling-title">
  <h2 id="scheduling-title">{t('settings.scheduling')}</h2>
  <ModelSelect
    id={`${id}-model`}
    label={t('settings.newDeckModel')}
    bind:value={model}
    customBoxes={saved}
    onchange={saveModel}
  />
  <p class="muted small">{t('settings.newDeckModelHelp')}</p>

  <form class="stack" onsubmit={saveBox} aria-labelledby={`${id}-box`} novalidate>
    <h3 id={`${id}-box`}>{t('settings.customBox')}</h3>
    <p class="muted small">{t('settings.customBoxHelp')}</p>
    <div class="field">
      <label for={`${id}-count`}>{t('settings.boxCount')}</label>
      <select
        id={`${id}-count`}
        value={box.length}
        onchange={(e) => resize(Number(e.currentTarget.value))}
      >
        {#each COUNTS as n (n)}<option value={n}>{n}</option>{/each}
      </select>
    </div>
    <div class="days">
      {#each box as _, i (i)}
        <div class="field">
          <label for={`${id}-day-${i}`}>{t('settings.boxDays', { n: i + 1 })}</label>
          <input
            id={`${id}-day-${i}`}
            type="number"
            inputmode="numeric"
            min="1"
            max={MAX_BOX_DAYS}
            bind:value={box[i]}
            aria-invalid={error !== null}
            oninput={() => (error = null)}
          />
        </div>
      {/each}
    </div>
    {#if error}<p class="error-text" role="alert">{t(ERRORS[error])}</p>{/if}
    <div>
      <button class="btn" type="submit" disabled={busy}>{t('settings.saveBox')}</button>
    </div>
  </form>
</section>

<style>
  h3 {
    margin: 0;
    font-size: 1rem;
  }

  .days {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
    gap: var(--space-2);
  }
</style>
