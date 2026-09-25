import { href, parseHash, type Params, type Query, type QueryInput } from './url'

export { href, matchPath, type Params, type Query } from './url'

/** Props received by every screen in `src/routes`. */
export interface RouteProps {
  params: Params
  query: Query
}

/** Current route, updated on `hashchange`. */
export const route = $state(parseHash(location.hash))

window.addEventListener('hashchange', () => {
  const next = parseHash(location.hash)
  route.path = next.path
  route.query = next.query
})

export function navigate(path: string, query: QueryInput = {}): void {
  location.hash = href(path, query)
}
