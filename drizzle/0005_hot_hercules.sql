CREATE TABLE `parent_grants` (
	`phone` text PRIMARY KEY NOT NULL,
	`student_ids` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`actor` text NOT NULL
);
