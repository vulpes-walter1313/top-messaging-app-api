import {
  integer,
  sqliteTable,
  text,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";
import { relations, sql } from "drizzle-orm";

export const users = sqliteTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()), // cuid2
  name: text("name"),
  email: text("email").notNull(),
  password: text("password").notNull(),
  image: text("image"),
});

export const usersRelations = relations(users, ({ many }) => ({
  chats: many(chats),
  chats_users: many(chats_users),
  messages: many(messages),
}));

export const chats = sqliteTable("chats", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createId()),
  chatname: text("chatname").notNull(),
  chatLetters: text("chat_letters", { length: 2 }).notNull().default("CA"),
  chatDescription: text("chat_description", { length: 256 }),
  chatAdmin: text("chat_admin")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const chatsRelations = relations(chats, ({ many, one }) => ({
  admin: one(users, {
    fields: [chats.chatAdmin],
    references: [users.id],
  }),
  chat_users: many(chats_users),
  messages: many(messages),
}));

export const chats_users = sqliteTable(
  "chats_users",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.chatId, t.userId] }) }),
);

export const chats_users_relations = relations(chats_users, ({ one }) => ({
  chat: one(chats, {
    fields: [chats_users.chatId],
    references: [chats.id],
  }),
  user: one(users, {
    fields: [chats_users.userId],
    references: [users.id],
  }),
}));

export const messages = sqliteTable("messages", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createId()),
  chatId: text("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id],
  }),
  author: one(users, {
    fields: [messages.authorId],
    references: [users.id],
  }),
}));
