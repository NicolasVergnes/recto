<script lang="ts">
  import { t, type MessageKey } from '$lib/i18n'
  import Icon, { type IconName } from '../Icon.svelte'

  interface Props {
    /** Current route path: the matching item is the current page. */
    path: string
  }
  let { path }: Props = $props()

  interface NavItem {
    path: string
    label: MessageKey
    icon: IconName
    /** Shown in the side navigation only, not in the bottom bar. */
    desktopOnly?: boolean
  }
  const items: NavItem[] = [
    { path: '/', label: 'nav.home', icon: 'home' },
    { path: '/notes/new', label: 'nav.add', icon: 'plus', desktopOnly: true },
    { path: '/cards', label: 'nav.cards', icon: 'cards' },
    { path: '/import', label: 'nav.import', icon: 'upload', desktopOnly: true },
    { path: '/stats', label: 'nav.stats', icon: 'chart' },
    { path: '/settings', label: 'nav.settings', icon: 'settings' },
  ]

  function isActive(itemPath: string): boolean {
    return itemPath === '/' ? path === '/' : path.startsWith(itemPath)
  }
</script>

<nav class="nav" aria-label={t('nav.label')}>
  <span class="brand">{t('app.name')}</span>
  <ul>
    {#each items as item (item.path)}
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

<style>
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
</style>
