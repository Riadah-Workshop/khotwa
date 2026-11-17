CREATE TABLE `student_identities` (
	`student_id` text PRIMARY KEY NOT NULL,
	`identity_number` text NOT NULL,
	`actor` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_identity_number_unique` ON `student_identities` (`identity_number`);