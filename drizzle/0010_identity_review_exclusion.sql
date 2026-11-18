ALTER TABLE `student_identity_reviews` ADD `exclusion_reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `student_identity_reviews` ADD `excluded_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `student_identity_reviews` ADD `excluded_by` text DEFAULT '' NOT NULL;