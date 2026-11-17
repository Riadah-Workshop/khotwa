CREATE TABLE `desk_closures` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`version` text NOT NULL,
	`kind` text NOT NULL,
	`record_id` text NOT NULL,
	`outcome` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `desk_closure_task_version_unique` ON `desk_closures` (`task_id`,`version`);