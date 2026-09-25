<script lang="ts">
  import type { Component } from 'svelte'
  import { tick } from 'svelte'
  import { t, type MessageKey } from '$lib/i18n'
  import { matchPath, route, type Params, type RouteProps } from '$lib/router.svelte'
  import { applyUpdate, pwa } from '$lib/state/pwa.svelte'
  import { loadPrefs } from '$lib/state/prefs.svelte'
  import ConfirmHost from '$lib/ui/ConfirmHost.svelte'
  import Icon, { type IconName } from '$lib/ui/Icon.svelte'
  import Toasts from '$lib/ui/Toasts.svelte'
  import Cards from './routes/Cards.svelte'
  import Deck from './routes/Deck.svelte'
  import Editor from './routes/Editor.svelte'
  import Home from './routes/Home.svelte'
  import Import from './routes/Import.svelte'
  import NotFound from './routes/NotFound.svelte'
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
    { pattern: '/stats', component: Stats },
    { pattern: '/settings', component: Settings },
  ]

  interface NavItem {
    path: string
    label: MessageKey
    icon: IconName
    desktopOnly?: boolean
  }
  const nav: NavItem[] = [
    { path: '/', label: 'nav.home', icon: 'home' },
    { path: '/notes/new', label: 'nav.add', icon: 'plus', desktopOnly: true },
    { path: '/cards', label: 'nav.cards', icon: 'cards' },
    { path: '/import', label: 'nav.import', icon: 'upload', desktopOnly: true },
    { path: '/stats', label: 'nav.stats', icon: 'chart' },
    { path: '/settings', label: 'nav.settings', icon: 'settings' },
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

  function isActive(path: string): boolean {
    return path === '/' ? route.path === '/' : route.path.startsWith(path)
  }

  function skipToContent() {
    main?.focus()
  }
</script>

<button class="skip-link btn" type="button" onclick={skipToContent}>{t('app.skipToContent')}</button
>

<div class="layout" class:reviewing>
  {#if !reviewing}
    <nav class="nav" aria-label={t('nav.label')}>
      <span class="brand">{t('app.name')}</span>
      <ul>
        {#each nav as item (item.path)}
          <li class:desktop-only={item.desktopOnly}>
            <a
              href={`#${item.path}`}
              aria-current={isActive(item.path) ? 'page' : undefined}
              class:active={isActive(item.path)}
            >
              <Icon name={item.icon} />
              <span>{t(item.label)}</span>
            </a>
          </li>
        {/each}
      </ul>
    </nav>
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
  <div class="update-banner" role="status">
    <span>{t('app.updateAvailable')}</span>
    <button class="btn btn-primary btn-sm" type="button" onclick={applyUpdate}>
      {t('app.reload')}
    </button>
  </div>
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

  .nav {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 10;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding-bottom: env(safe-area-inset-bottom);
  }

  .brand {
    display: none;
  }

  .nav ul {
    display: flex;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .nav li {
    flex: 1;
  }

  .nav a {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 3.75rem;
    padding: var(--space-1);
    color: var(--text-2);
    text-decoration: none;
    font-size: 0.75rem;
  }

  .nav a.active {
    color: var(--accent);
    font-weight: 600;
  }

  .desktop-only {
    display: none;
  }

  @media (min-width: 900px) {
    .layout {
      display: grid;
      grid-template-columns: 14rem 1fr;
      padding-bottom: 0;
    }

    .layout.reviewing {
      grid-template-columns: 1fr;
    }

    .nav {
      position: sticky;
      top: 0;
      height: 100dvh;
      border-top: none;
      border-right: 1px solid var(--border);
      padding: var(--space-4) var(--space-2);
    }

    .brand {
      display: block;
      font-weight: 700;
      font-size: 1.25rem;
      color: var(--accent);
      padding: 0 var(--space-3) var(--space-4);
    }

    .nav ul {
      flex-direction: column;
      gap: var(--space-1);
    }

    .desktop-only {
      display: list-item;
    }

    .nav a {
      flex-direction: row;
      justify-content: flex-start;
      gap: var(--space-3);
      min-height: 2.75rem;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius);
      font-size: 1rem;
    }

    .nav a.active {
      background: var(--accent-soft);
    }
  }

  .update-banner {
    position: fixed;
    left: 50%;
    bottom: calc(4.75rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 50;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
  }

  @media (min-width: 900px) {
    .update-banner {
      bottom: var(--space-4);
    }
  }
</style>
