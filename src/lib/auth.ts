import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { getDB } from '@/lib/db';
import { schema, user } from '@/lib/schema';

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

  const db = getDB(env.DB);
  return betterAuth({
    appName: 'times',
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
      transaction: false,
    }),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    user: {
      changeEmail: { enabled: false },
      additionalFields: {
        disabled: {
          type: 'boolean',
          input: false,
          required: false,
          defaultValue: false,
        },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async ({ userId }) => {
            const [member] = await db
              .select({ disabled: user.disabled })
              .from(user)
              .where(eq(user.id, userId));
            if (member?.disabled)
              throw new APIError('FORBIDDEN', {
                code: 'MEMBER_DISABLED',
                message: 'このアカウントは利用停止中です。',
              });
          },
        },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  });
};
