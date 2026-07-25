/** Lightweight in-app routes (no external router dependency). */
export type Route =
  | { name: 'campaigns' }
  | { name: 'campaign'; id: string }
  | { name: 'leads' }
  | { name: 'lead'; id: string }
  | { name: 'settings' };

export type NavSection = 'campaigns' | 'leads' | 'settings';

/** Which sidebar section a route belongs to. */
export function sectionOf(route: Route): NavSection {
  if (route.name === 'settings') return 'settings';
  return route.name === 'leads' || route.name === 'lead'
    ? 'leads'
    : 'campaigns';
}
