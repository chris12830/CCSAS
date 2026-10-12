ALTER TABLE `sas_networks` ADD `write_token` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE `sas_supplier_records` (
 `collection` text NOT NULL,
 `id` text NOT NULL,
 `supplier_id` text NOT NULL,
 `data` text NOT NULL,
 `updated_at` text NOT NULL,
 PRIMARY KEY(`collection`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_sas_supplier_records_supplier` ON `sas_supplier_records` (`supplier_id`, `collection`);
