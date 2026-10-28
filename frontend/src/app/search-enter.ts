/**
 * The first current match a plain Enter in a search field should choose, or null when nothing should
 * happen: another key, Enter with a modifier, a held key, text still being composed, or an empty query.
 * Uses the latest computed matches even if Angular has not painted the result list yet.
 */
export function enterMatch<T>(event: KeyboardEvent, query: string, results: readonly T[]): T | null {
  const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
  if (event.key !== 'Enter' || event.isComposing || modified) {
    return null;
  }
  event.preventDefault();
  if (event.repeat || !query.trim()) {
    return null;
  }
  return results[0] ?? null;
}
