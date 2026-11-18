CREATE TABLE `student_identity_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`source_name` text NOT NULL,
	`source_grade` text NOT NULL,
	`source_classroom` text NOT NULL,
	`source_number` text NOT NULL,
	`reason` text NOT NULL,
	`student_id` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`actor` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
