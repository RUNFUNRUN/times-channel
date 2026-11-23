import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireSession } from '@/app/api/_lib/middleware';
import type { ApiEnv } from '@/app/api/_lib/types';
import { authRoutes } from '@/app/api/_routes/auth';
import { channelsRoutes } from '@/app/api/_routes/channels';
import { messagesRoutes } from '@/app/api/_routes/messages';
import { threadsRoutes } from '@/app/api/_routes/threads';
import { uploadsRoutes } from '@/app/api/_routes/uploads';
import { workspaceRoutes } from '@/app/api/_routes/workspace';

export const app = new Hono<ApiEnv>()
  .basePath('/api')
  .route('/auth', authRoutes)
  .use('*', requireSession)
  .route('/workspace', workspaceRoutes)
  .route('/channels', channelsRoutes)
  .route('/messages', messagesRoutes)
  .route('/messages', threadsRoutes)
  .route('/uploads', uploadsRoutes);

app.onError((error, c) => {
  if (error instanceof HTTPException)
    return c.json({ error: error.message }, error.status);
  console.error(error);
  return c.json(
    { error: '処理に失敗しました。時間をおいて再度お試しください。' },
    500,
  );
});

export type AppType = typeof app;
