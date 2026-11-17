CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`details` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`actor_id` text NOT NULL,
	`follow_status` text DEFAULT 'none' NOT NULL,
	`outcome` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`actor` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `followups` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`status` text NOT NULL,
	`outcome` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`grade` text NOT NULL,
	`classroom` text NOT NULL,
	`guardian` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
