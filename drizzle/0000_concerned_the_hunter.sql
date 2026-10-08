CREATE TABLE `sas_events` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sas_events_app_date` ON `sas_events` (`app_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sas_networks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
