import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDB } from '@/lib/db';
import { schema } from '@/lib/schema';

export const getAuth = (env: CloudflareEnv, origin: string) => {
  const baseURL =
    env.BETTER_AUTH_URL ||
    (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
      ? origin
      : undefined);
  if (!baseURL || !env.BETTER_AUTH_SECRET) {
    throw new Error(
      'BETTER_AUTH_URL and BETTER_AUTH_SECRET must be configured.',
    );
  }

  return betterAuth({
    appName: 'times',
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDB(env.DB), {
      provider: 'sqlite',
      schema,
      transaction: false,
    }),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    user: { changeEmail: { enabled: false } },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  });
};
