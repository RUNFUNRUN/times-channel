export type RealtimeScope = 'messages' | 'workspace' | 'private';
export type RealtimeEvent = { type: 'changed'; scope: RealtimeScope };
export const REALTIME_ROOM = 'workspace';
export const REALTIME_PATH = '/api/realtime';
export const realtimeQueryKeys = (scope?: RealtimeScope) =>
  scope === 'messages'
    ? ['messages', 'thread', 'notifications']
    : ['workspace', 'members', 'messages', 'thread', 'notifications'];
export const parseRealtimeEvent = (data: unknown): RealtimeEvent | null => {
  if (typeof data !== 'string') return null;
  try {
    const value: unknown = JSON.parse(data);
    return value &&
      typeof value === 'object' &&
      'type' in value &&
      value.type === 'changed' &&
      'scope' in value &&
      ['messages', 'workspace', 'private'].includes(String(value.scope))
      ? (value as RealtimeEvent)
      : null;
  } catch {
    return null;
  }
};
