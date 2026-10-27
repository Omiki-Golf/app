type RoundEvent = {
  eventType?: string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
};

// Keep ambiguous events (especially deletes, which may contain only a primary key).
export function shouldRefreshRoundList(
  event: RoundEvent | null | undefined,
  groupId: string | null,
  visibleIds: ReadonlySet<string>,
  loaded: boolean,
): boolean {
  if (!loaded || !event || !['INSERT', 'UPDATE'].includes(event.eventType || '')) return true;
  const row = event.new;
  if (!row || typeof row.id !== 'string') return true;
  if (visibleIds.has(row.id) || (typeof event.old?.id === 'string' && visibleIds.has(event.old.id))) return true;
  if (!Object.prototype.hasOwnProperty.call(row, 'group_id')) return true;
  if (row.group_id !== null && typeof row.group_id !== 'string') return true;
  if (groupId) return row.group_id === groupId || event.old?.group_id === groupId;
  // Other people's quick rounds can still be shared with this account.
  return row.group_id === null || event.old?.group_id === null;
}
