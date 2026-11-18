CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`student_id` text NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`grade` text NOT NULL,
	`classroom` text NOT NULL,
	`status` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`actor` text NOT NULL,
	`actor_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `attendance_rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_student_date_unique` ON `attendance` (`student_id`,`date`);--> statement-breakpoint
CREATE TABLE `attendance_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`revision` integer NOT NULL,
	`actor` text NOT NULL,
	`actor_id` text NOT NULL,
	`saved_at` text NOT NULL,
	`summary` text NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `attendance_rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `attendance_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`grade` text NOT NULL,
	`classroom` text NOT NULL,
	`revision` integer NOT NULL,
	`total` integer NOT NULL,
	`actor` text NOT NULL,
	`actor_id` text NOT NULL,
	`saved_at` text NOT NULL,
	`commit_token` text NOT NULL
);
