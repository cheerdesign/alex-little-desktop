import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const notes = sqliteTable('guest_notes', {
  id: text('id').primaryKey(),
  ownerHash: text('owner_hash').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  drawing: text('drawing').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  revision: integer('revision').notNull().default(1),
  deletedAt: integer('deleted_at'),
}, table => [
  index('idx_guest_notes_created').on(table.createdAt, table.id),
  index('idx_guest_notes_owner_created').on(table.ownerHash, table.createdAt),
]);
