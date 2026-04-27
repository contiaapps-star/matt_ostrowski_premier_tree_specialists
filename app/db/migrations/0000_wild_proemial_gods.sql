CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`details` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_log_lead_id_idx` ON `audit_log` (`lead_id`);--> statement-breakpoint
CREATE INDEX `audit_log_created_at_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `faq_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`keywords` text DEFAULT '' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `faq_entries_category_idx` ON `faq_entries` (`category`);--> statement-breakpoint
CREATE INDEX `faq_entries_active_idx` ON `faq_entries` (`active`);--> statement-breakpoint
CREATE TABLE `lead_source_events` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`source` text NOT NULL,
	`received_at` integer NOT NULL,
	`raw_payload` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lead_source_events_lead_id_idx` ON `lead_source_events` (`lead_id`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`received_at` integer NOT NULL,
	`source` text NOT NULL,
	`dedup_phone_e164` text,
	`status` text DEFAULT 'ingested' NOT NULL,
	`customer_name` text,
	`customer_phone_e164` text,
	`customer_email` text,
	`customer_address` text,
	`customer_city` text,
	`customer_zip` text,
	`service_area_county` text,
	`out_of_service_area` integer DEFAULT false NOT NULL,
	`scope_raw` text NOT NULL,
	`scope_category` text,
	`scope_summary` text,
	`confidence_score` real,
	`confidence_reasoning` text,
	`escalation_triggered` integer DEFAULT false NOT NULL,
	`escalation_reason` text,
	`response_text` text,
	`response_sent_at` integer,
	`response_sent_by` text,
	`arbostar_request_id` text,
	`arbostar_synced_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leads_dedup_phone_idx` ON `leads` (`dedup_phone_e164`);--> statement-breakpoint
CREATE INDEX `leads_status_idx` ON `leads` (`status`);--> statement-breakpoint
CREATE INDEX `leads_received_at_idx` ON `leads` (`received_at`);--> statement-breakpoint
CREATE INDEX `leads_source_idx` ON `leads` (`source`);--> statement-breakpoint
CREATE TABLE `outbound_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`channel` text NOT NULL,
	`recipient` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider_message_id` text,
	`error_message` text,
	`sent_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `outbound_messages_lead_id_idx` ON `outbound_messages` (`lead_id`);--> statement-breakpoint
CREATE INDEX `outbound_messages_status_idx` ON `outbound_messages` (`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'call_taker' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `zip_code_to_county` (
	`zip` text PRIMARY KEY NOT NULL,
	`county` text NOT NULL,
	`region` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `zip_code_to_county_county_idx` ON `zip_code_to_county` (`county`);--> statement-breakpoint
CREATE INDEX `zip_code_to_county_region_idx` ON `zip_code_to_county` (`region`);