import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";
export const networks = sqliteTable("sas_networks", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(),
  data: text("data").notNull(), version: integer("version").notNull().default(0),
  updatedAt: text("updated_at").notNull(), writeToken:text("write_token").notNull().default(""),
});
export const events = sqliteTable("sas_events", {
  id: text("id").primaryKey(), appId: text("app_id").notNull(),
  campaignId: text("campaign_id").notNull(), kind: text("kind").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_sas_events_app_date").on(table.appId, table.createdAt)]);
export const connections = sqliteTable("sas_connections", {
  appId: text("app_id").primaryKey(), lastSeen: text("last_seen").notNull(),
});

export const supplierRecords = sqliteTable("sas_supplier_records",{
  collection:text("collection").notNull(),id:text("id").notNull(),
  supplierId:text("supplier_id").notNull(),data:text("data").notNull(),
  updatedAt:text("updated_at").notNull(),
}, table=>[
  primaryKey({columns:[table.collection,table.id]}),
  index("idx_sas_supplier_records_supplier").on(table.supplierId,table.collection),
]);
