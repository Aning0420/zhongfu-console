import { pgTable, serial, timestamp, text, varchar, jsonb, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"


export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    role: text("role").notNull(),
    content: text("content").notNull(),
    image_url: text("image_url"),
    synced_data: jsonb("synced_data"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("chat_messages_role_idx").on(table.role),
    index("chat_messages_created_at_idx").on(table.created_at),
  ]
);
