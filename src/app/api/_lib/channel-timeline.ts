import { eq, isNull, or } from 'drizzle-orm';
import { message } from '@/lib/schema';

export const isChannelTimelinePost = () =>
  or(isNull(message.parentId), eq(message.alsoPostToChannel, true));
