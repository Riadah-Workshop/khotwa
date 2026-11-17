CREATE TABLE `student_families` (
	`student_id` text PRIMARY KEY NOT NULL,
	`family_id` text DEFAULT '' NOT NULL,
	`actor` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
