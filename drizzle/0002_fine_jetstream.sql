CREATE TABLE `absence_events` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`kind` text NOT NULL,
	`notes` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `absence_followups` (
	`student_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`total_count` integer NOT NULL,
	`last_absent` text NOT NULL,
	`contact_status` text DEFAULT 'none' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`actor` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `attendance_rounds` ADD `completed` integer DEFAULT 1 NOT NULL;