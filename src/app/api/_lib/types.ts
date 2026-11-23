import type { getDB } from '@/lib/db';

export type ApiEnv = {
  Variables: {
    db: ReturnType<typeof getDB>;
    user: { id: string; name: string; email: string; image?: string | null };
  };
};
