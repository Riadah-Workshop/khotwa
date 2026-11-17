ALTER TABLE `school_evidence` ADD `trip_id` text REFERENCES school_trips(id);--> statement-breakpoint
ALTER TABLE `school_trip_students` ADD `participation` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `school_trip_students` ADD `participation_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `school_trip_students` ADD `participation_by` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `school_trips` ADD `kind` text DEFAULT 'trip' NOT NULL;--> statement-breakpoint
ALTER TABLE `school_trips` ADD `goal` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `school_trips` ADD `execution_status` text DEFAULT 'planning' NOT NULL;--> statement-breakpoint
ALTER TABLE `school_trips` ADD `actual_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `school_trips` ADD `results` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `school_trips` ADD `teacher_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `school_trips` ADD `completed_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `school_trips` ADD `completed_by` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `school_trips` ADD `activity_token` text DEFAULT '' NOT NULL;