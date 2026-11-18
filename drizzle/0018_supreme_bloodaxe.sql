CREATE TABLE `platform_papers` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`name` text NOT NULL,
	`grade` text NOT NULL,
	`classroom` text NOT NULL,
	`delivered_at` text NOT NULL,
	`status` text NOT NULL,
	`signed` integer DEFAULT 0 NOT NULL,
	`returned` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_papers_student_date_unique` ON `platform_papers` (`student_id`,`delivered_at`);