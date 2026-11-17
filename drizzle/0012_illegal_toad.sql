CREATE TABLE `school_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text,
	`title` text NOT NULL,
	`domain` text NOT NULL,
	`evidence_date` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`file_key` text DEFAULT '' NOT NULL,
	`file_name` text DEFAULT '' NOT NULL,
	`mime` text DEFAULT '' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `school_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text,
	`case_id` text,
	`title` text NOT NULL,
	`due_date` text NOT NULL,
	`responsible` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`outcome` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `school_trip_students` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`student_id` text NOT NULL,
	`name` text NOT NULL,
	`grade` text NOT NULL,
	`classroom` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`response` text DEFAULT 'pending' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`recorded_at` text DEFAULT '' NOT NULL,
	`actor` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `school_trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `school_trips` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`destination` text NOT NULL,
	`event_date` text NOT NULL,
	`meeting_time` text NOT NULL,
	`return_time` text NOT NULL,
	`supervisor` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`actor` text NOT NULL
);
