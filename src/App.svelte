<script lang="ts">
  import type { Component } from 'svelte'
  import { tick } from 'svelte'
  import { t } from '$lib/i18n'
  import { matchPath, route, type Params, type RouteProps } from '$lib/router.svelte'
  import { applyUpdate, pwa } from '$lib/state/pwa.svelte'
  import { loadPrefs } from '$lib/state/prefs.svelte'
  import AppNav from '$lib/ui/app/AppNav.svelte'
  import UpdateBanner from '$lib/ui/app/UpdateBanner.svelte'
  import ConfirmHost from '$lib/ui/ConfirmHost.svelte'
  import Toasts from '$lib/ui/Toasts.svelte'
  import Cards from './routes/Cards.svelte'
  import Deck from './routes/Deck.svelte'
  import Editor from './routes/Editor.svelte'
  import Home from './routes/Home.svelte'
  import Import from './routes/Import.svelte'
  import NotFound from './routes/NotFound.svelte'
  import NoteTypeEditor from './routes/NoteTypeEditor.svelte'
  import NoteTypes from './routes/NoteTypes.svelte'
  import Review from './routes/Review.svelte'
  import Settings from './routes/Settings.svelte'
  import Stats from './routes/Stats.svelte'

  const routes: { pattern: string; component: Component<RouteProps> }[] = [
    { pattern: '/', component: Home },
    { pattern: '/review', component: Review },
    { pattern: '/decks/:id', component: Deck },
    { pattern: '/cards', component: Cards },
    { pattern: '/notes/new', component: Editor },
    { pattern: '/notes/:id', component: Editor },
    { pattern: '/import', component: Import },
    { pattern: '/note-types', component: NoteTypes },
    { pattern: '/note-types/:id', component: NoteTypeEditor },
    { pattern: '/stats', component: Stats },
    { pattern: '/settings', component: Settings },
  ]

  const current = $derived.by((): { component: Component<RouteProps>; params: Params } => {
    for (const r of routes) {
      const params = matchPath(r.pattern, route.path)
      if (params) return { component: r.component, params }
    }
    return { component: NotFound, params: {} }
  })
  const reviewing = $derived(route.path === '/review')

  let main: HTMLElement | undefined = $state()

  $effect(() => {
    void loadPrefs()
  })

  // Move focus to the new screen's heading after navigation (screen readers, keyboard).
  $effect(() => {
    void route.path
    void tick().then(() => {
      const heading = main?.querySelector<HTMLElement>('h1')
      if (heading && document.activeElement === document.body) heading.focus()
    })
  })

  function skipToContent() {
    main?.focus()
  }
</script>

<button class="skip-link btn" type="button" onclick={skipToContent}>{t('app.skipToContent')}</button
>

<div class="layout" class:reviewing>
  {#if !reviewing}
    <AppNav path={route.path} />
  {/if}

  <main bind:this={main} tabindex="-1">
    {#key route.path}
      <current.component params={current.params} query={route.query} />
    {/key}
  </main>
</div>

<ConfirmHost />
<Toasts />

{#if pwa.needRefresh && !reviewing}
  <UpdateBanner onreload={applyUpdate} />
{/if}

<style>
  .skip-link {
    position: absolute;
    left: var(--space-2);
    top: -4rem;
    z-index: 100;
  }

  .skip-link:focus {
    top: var(--space-2);
  }

  .layout {
    min-height: 100dvh;
    padding-bottom: calc(4.25rem + env(safe-area-inset-bottom));
  }

  .layout.reviewing {
    padding-bottom: 0;
  }

  main {
    outline: none;
  }

  /* Side navigation: the first column holds <AppNav>, hidden in the review layout. */
  @media (min-width: 900px) {
    .layout {
      display: grid;
      grid-template-columns: 14rem 1fr;
      padding-bottom: 0;
    }

    .layout.reviewing {
      grid-template-columns: 1fr;
    }
  }
</style>
