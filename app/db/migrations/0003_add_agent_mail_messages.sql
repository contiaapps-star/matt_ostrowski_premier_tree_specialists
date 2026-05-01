CREATE TABLE `agent_mail_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`agentmail_message_id` text NOT NULL,
	`inbox_id` text,
	`received_at` integer NOT NULL,
	`from_address` text,
	`to_addresses` text,
	`subject` text,
	`text_body` text,
	`html_body` text,
	`raw_mime` text,
	`headers_json` text,
	`detected_source` text,
	`lead_id` text,
	`parse_status` text DEFAULT 'pending' NOT NULL,
	`parse_error` text,
	`raw_payload` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_mail_messages_agentmail_message_id_unique` ON `agent_mail_messages` (`agentmail_message_id`);--> statement-breakpoint
CREATE INDEX `agent_mail_messages_received_at_idx` ON `agent_mail_messages` (`received_at`);--> statement-breakpoint
CREATE INDEX `agent_mail_messages_parse_status_idx` ON `agent_mail_messages` (`parse_status`);--> statement-breakpoint
CREATE INDEX `agent_mail_messages_lead_id_idx` ON `agent_mail_messages` (`lead_id`);
