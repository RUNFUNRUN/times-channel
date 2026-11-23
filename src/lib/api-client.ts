import type { InferResponseType } from 'hono/client';
import { hc } from 'hono/client';
import type { AppType } from '@/app/api/_lib/app';

export const client = hc<AppType>('/');
export type Workspace = InferResponseType<
  typeof client.api.workspace.$get,
  200
>;
export type Channel = Workspace['channels'][number];
export type MessagePage = InferResponseType<
  typeof client.api.messages.$get,
  200
>;
export type Message = MessagePage['messages'][number];
export type Thread = InferResponseType<
  (typeof client.api.messages)[':id']['thread']['$get'],
  200
>;
export type Members = InferResponseType<typeof client.api.members.$get, 200>;
export type NotificationPage = InferResponseType<
  typeof client.api.notifications.$get,
  200
>;
export type NotificationItem = NotificationPage['notifications'][number];

export type ApiResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

export const readResponse = async <T>(response: ApiResponse): Promise<T> => {
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) window.location.reload();
    throw new Error(
      data &&
        typeof data === 'object' &&
        'error' in data &&
        typeof data.error === 'string'
        ? data.error
        : '処理に失敗しました。入力内容を確認してください。',
    );
  }
  return data as T;
};
