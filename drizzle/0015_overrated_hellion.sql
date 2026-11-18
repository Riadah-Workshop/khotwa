CREATE TABLE `care_intake` (
	`id` text PRIMARY KEY NOT NULL,
	`source_key` text NOT NULL,
	`source_name` text NOT NULL,
	`source_grade` text NOT NULL,
	`source_classroom` text NOT NULL,
	`source_ref` text NOT NULL,
	`data` text NOT NULL,
	`student_id` text,
	`status` text DEFAULT 'review' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`link_token` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `care_intake_source_unique` ON `care_intake` (`source_key`);--> statement-breakpoint
CREATE TABLE `student_care` (
	`student_id` text PRIMARY KEY NOT NULL,
	`health_notes` text DEFAULT '' NOT NULL,
	`family_notes` text DEFAULT '' NOT NULL,
	`economic_notes` text DEFAULT '' NOT NULL,
	`learning_notes` text DEFAULT '' NOT NULL,
	`general_notes` text DEFAULT '' NOT NULL,
	`emergency_name` text DEFAULT '' NOT NULL,
	`emergency_relationship` text DEFAULT '' NOT NULL,
	`emergency_phone` text DEFAULT '' NOT NULL,
	`source_notes` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
