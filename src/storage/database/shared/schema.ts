import { pgTable, serial, timestamp, index, varchar, text, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	role: text().notNull(),
	content: text().notNull(),
	imageUrl: text("image_url"),
	syncedData: jsonb("synced_data"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("chat_messages_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("chat_messages_role_idx").using("btree", table.role.asc().nullsLast().op("text_ops")),
]);
