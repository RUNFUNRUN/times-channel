import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .notNull()
    .default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_user_idx').on(table.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('account_user_idx').on(table.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const channel = sqliteTable('channel', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  ownerId: text('owner_id')
    .unique()
    .references(() => user.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull(),
});

export const message = sqliteTable(
  'message',
  {
    id: text('id').primaryKey(),
    channelId: text('channel_id')
      .notNull()
      .references(() => channel.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').references((): AnySQLiteColumn => message.id, {
      onDelete: 'cascade',
    }),
    alsoPostToChannel: integer('also_post_to_channel', { mode: 'boolean' })
      .notNull()
      .default(false),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at'),
  },
  (table) => [
    index('message_channel_time_idx').on(
      table.channelId,
      table.createdAt,
      table.id,
    ),
    index('message_parent_idx').on(table.parentId),
    index('message_time_idx').on(table.createdAt, table.id),
  ],
);

// Keep the quote card after the source is deleted without copying its content.
export const messageQuote = sqliteTable(
  'message_quote',
  {
    messageId: text('message_id')
      .primaryKey()
      .references(() => message.id, { onDelete: 'cascade' }),
    sourceId: text('source_id').references(() => message.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [index('message_quote_source_idx').on(table.sourceId)],
);

export const reaction = sqliteTable(
  'reaction',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId, table.emoji] }),
  ],
);

export const attachment = sqliteTable(
  'attachment',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull().unique(),
    name: text('name').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
  },
  (table) => [index('attachment_message_idx').on(table.messageId)],
);

export const fileCleanup = sqliteTable('file_cleanup', {
  objectKey: text('object_key').primaryKey(),
});

export const messageMention = sqliteTable(
  'message_mention',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId] }),
    index('mention_user_idx').on(table.userId),
  ],
);

export const notification = sqliteTable(
  'notification',
  {
    id: text('id').primaryKey(),
    eventKey: text('event_key').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    messageId: text('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['mention', 'reply', 'reaction'] }).notNull(),
    emoji: text('emoji'),
    createdAt: integer('created_at').notNull(),
    readAt: integer('read_at'),
  },
  (table) => [
    index('notification_user_time_idx').on(
      table.userId,
      table.createdAt,
      table.id,
    ),
    index('notification_unread_idx').on(table.userId, table.readAt),
    index('notification_message_idx').on(table.messageId),
  ],
);

export const bookmark = sqliteTable(
  'bookmark',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.messageId] })],
);

export const favorite = sqliteTable(
  'favorite',
  {
    channelId: text('channel_id')
      .notNull()
      .references(() => channel.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.channelId] })],
);

export const schema = {
  user,
  session,
  account,
  verification,
  channel,
  message,
  reaction,
  bookmark,
  favorite,
  attachment,
  fileCleanup,
  messageMention,
  messageQuote,
  notification,
};
