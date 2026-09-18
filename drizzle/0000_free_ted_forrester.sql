CREATE TABLE `guest_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`drawing` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_guest_notes_created` ON `guest_notes` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_guest_notes_owner_created` ON `guest_notes` (`owner_hash`,`created_at`);