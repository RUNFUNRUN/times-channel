import { parseRealtimeEvent, type RealtimeScope } from '../src/lib/realtime';

// Bun supports handshake headers; lib.dom's constructor omits that overload.
const BunWebSocket = WebSocket as unknown as new (
  url: string,
  options: Bun.WebSocketOptions,
) => WebSocket;

export const connectRealtime = async (baseURL: string, cookie: string) => {
  const url = new URL('/api/realtime', baseURL);
  url.protocol = 'ws:';
  const socket = new BunWebSocket(url.href, {
    headers: { Origin: baseURL, Cookie: cookie },
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('WebSocket connection timed out'));
    }, 3000);
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error('WebSocket connection failed'));
      },
      { once: true },
    );
  });
  return socket;
};

export const waitForSocketMessage = (
  socket: WebSocket,
  match: (data: string) => boolean,
) =>
  new Promise<string>((resolve, reject) => {
    const receive = (event: MessageEvent) => {
      if (!match(String(event.data))) return;
      clearTimeout(timer);
      socket.removeEventListener('message', receive);
      resolve(String(event.data));
    };
    const timer = setTimeout(() => {
      socket.removeEventListener('message', receive);
      reject(new Error('Realtime event timed out'));
    }, 3000);
    socket.addEventListener('message', receive);
  });
export const withRealtimeEvent = async (
  socket: WebSocket,
  scope: RealtimeScope,
  action: () => Promise<Response>,
) => {
  const event = waitForSocketMessage(
    socket,
    (data) => parseRealtimeEvent(data)?.scope === scope,
  );
  const [response, payload] = await Promise.all([action(), event]);
  return { response, payload: JSON.parse(payload) };
};
export const waitForSocketClose = (socket: WebSocket) =>
  new Promise<number>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('WebSocket did not close')),
      3000,
    );
    socket.addEventListener(
      'close',
      (event) => {
        clearTimeout(timer);
        resolve(event.code);
      },
      { once: true },
    );
  });
