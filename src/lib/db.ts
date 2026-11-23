import { drizzle } from 'drizzle-orm/d1';
import { schema } from '@/lib/schema';

export const getDB = (binding: D1Database) => drizzle(binding, { schema });
