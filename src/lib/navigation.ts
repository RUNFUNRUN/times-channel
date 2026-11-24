export type View =
  | { kind: 'all' }
  | { kind: 'channel'; id: string }
  | { kind: 'saved' }
  | { kind: 'notifications' }
  | { kind: 'search'; q: string }
  | { kind: 'message'; id: string };

export const channelPath = (id: string) =>
  `/channels/${encodeURIComponent(id)}`;
export const messagePath = (id: string) =>
  `/messages/${encodeURIComponent(id)}`;

export const viewPath = (view: View) => {
  switch (view.kind) {
    case 'all':
      return '/';
    case 'channel':
      return channelPath(view.id);
    case 'message':
      return messagePath(view.id);
    case 'saved':
      return '/saved';
    case 'notifications':
      return '/notifications';
    case 'search':
      return `/search?${new URLSearchParams({ q: view.q })}`;
  }
};

export const threadPath = (pathname: string, search: string, id?: string) => {
  const params = new URLSearchParams(search);
  if (id) params.set('thread', id);
  else params.delete('thread');
  return `${pathname}${params.size ? `?${params}` : ''}`;
};
