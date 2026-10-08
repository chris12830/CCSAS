import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const networks = sqliteTable("sas_networks", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(),
  data: text("data").notNull(), version: integer("version").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});
export const events = sqliteTable("sas_events", {
  id: text("id").primaryKey(), appId: text("app_id").notNull(),
  campaignId: text("campaign_id").notNull(), kind: text("kind").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_sas_events_app_date").on(table.appId, table.createdAt)]);
export const connections = sqliteTable("sas_connections", {
  appId: text("app_id").primaryKey(), lastSeen: text("last_seen").notNull(),
});
