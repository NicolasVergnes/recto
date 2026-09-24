---
name: svelte5-conventions
description: Conventions Svelte 5 (runes, snippets, état partagé en .svelte.ts, accessibilité, routeur hash) et TypeScript strict pour Recto. Charger avant d'écrire ou de modifier un composant .svelte, un module d'état ou le routeur.
---

# Svelte 5 dans Recto

## 1. Runes seulement

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/t'
  interface Props { card: Card; onAnswer: (rating: Rating) => void; revealed?: boolean }
  let { card, onAnswer, revealed = $bindable(false) }: Props = $props()
  let elapsed = $state(0)
  const front = $derived(renderSide(card, 'front'))
  $effect(() => {
    const id = setInterval(() => (elapsed += 1), 1000)
    return () => clearInterval(id)
  })
</script>
```

- `$props()` typé par une `interface Props` ; `$bindable()` seulement quand le parent doit écrire.
- `$derived` pour tout ce qui se calcule ; `$effect` seulement pour les effets de bord (timers, DOM, souscriptions) avec nettoyage.
- Interdit : `export let`, `$:`, `createEventDispatcher`, stores `writable` de `svelte/store` pour l'état applicatif, `on:click` (utiliser `onclick`).
- Événements enfant → parent : callbacks dans les props (`onAnswer`), pas de dispatch.
- Contenu paramétré : `{#snippet}` + `{@render}` plutôt que des slots.

## 2. État partagé

Modules `*.svelte.ts` exportant des objets réactifs, un par domaine :

```ts
// src/lib/state/session.svelte.ts
export const session = $state({ queue: [] as string[], index: 0, startedAt: 0 })
export function currentCardId() { return session.queue[session.index] }
```

Lecture de la base réactive :

```ts
// src/lib/db/live.svelte.ts
import { liveQuery } from 'dexie'
export function live<T>(query: () => Promise<T>, initial: T) {
  let value = $state(initial)
  $effect(() => { const sub = liveQuery(query).subscribe(v => (value = v)); return () => sub.unsubscribe() })
  return { get value() { return value } }
}
```

Utiliser `live()` dans les composants pour les listes (paquets, cartes dues) ; l'écran de révision travaille sur une file en mémoire chargée une fois, pas sur des requêtes réactives (stabilité pendant la séance).

## 3. Structure d'un composant

Ordre : `<script>` (imports, props, état, dérivés, effets, handlers), markup, `<style>` scoped. Un composant ≤ 200 lignes ; au-delà, extraire. Les composants d'écran vivent dans `src/routes/`, les réutilisables dans `src/lib/ui/`. Aucune logique métier dans un `.svelte` : appeler `repo`, `scheduler`, `queue`.

## 4. Routeur hash

`src/lib/router.svelte.ts` : `route = $state({ path, params })` mis à jour sur `hashchange` ; `navigate(path, params)` ; `<Router>` fait correspondre `route.path` à un composant via une table. Pas de dépendance si le maison reste < 100 lignes.

## 5. Accessibilité et UI

- Chaque `<button>` a un texte ; les icônes SVG inline sont `aria-hidden="true"`.
- Raccourcis clavier gérés dans un seul `$effect` sur `window` (`keydown`), ignorés quand `event.target` est un champ de saisie.
- Focus : après « Afficher la réponse », déplacer le focus sur le premier bouton de notation ; après notation, sur « Afficher la réponse ».
- Classes utilitaires minimales dans `app.css` (tokens, `.btn`, `.card-surface`, `.visually-hidden`) ; pas de framework CSS.
- `prefers-reduced-motion` : aucune transition Svelte (`transition:`) sans le respecter (utiliser un helper `motionOk()`).

## 6. TypeScript

`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Pas de `any`, pas de `!` non justifié, pas d'`as` pour faire taire une erreur. Les types du domaine (`Rating`, `CardState`, `Card`…) viennent de `src/lib/domain/types.ts` ; les types de `ts-fsrs` ne sont importés que dans `src/lib/scheduler/fsrs.ts` (le domaine reste indépendant de la bibliothèque, mêmes valeurs entières).

## 7. Tests de composants

Les composants restent fins ; on teste le domaine en Vitest et les parcours en Playwright. Un composant n'est testé unitairement (`@testing-library/svelte`) que s'il contient une logique de présentation non triviale (comparaison de réponse tapée, rendu cloze).
