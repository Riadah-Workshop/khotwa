-- Global identities, configuration and login throttling only.
-- Student information remains in the existing default tables or cloned
-- physical tables per additional school; no existing records are changed.
CREATE TABLE IF NOT EXISTS `khotwa_schools` (
 `id` text PRIMARY KEY NOT NULL,
 `code` text NOT NULL UNIQUE,
 `name` text NOT NULL,
 `active` integer NOT NULL DEFAULT 1,
 `created_at` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `khotwa_accounts` (
 `id` text PRIMARY KEY NOT NULL,
 `school_id` text NOT NULL REFERENCES `khotwa_schools`(`id`),
 `email` text NOT NULL UNIQUE,
 `full_name` text NOT NULL,
 `role` text NOT NULL CHECK (`role` = 'deputy'),
 `password_hash` text NOT NULL,
 `active` integer NOT NULL DEFAULT 1,
 `session_version` integer NOT NULL DEFAULT 1,
 `created_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `khotwa_accounts_school_idx` ON `khotwa_accounts` (`school_id`);
CREATE TABLE IF NOT EXISTS `khotwa_parent_users` (
 `id` text PRIMARY KEY NOT NULL,
 `school_id` text NOT NULL REFERENCES `khotwa_schools`(`id`),
 `phone` text NOT NULL,
 `password_hash` text NOT NULL,
 `active` integer NOT NULL DEFAULT 1,
 `session_version` integer NOT NULL DEFAULT 1,
 `created_at` text NOT NULL,
 UNIQUE (`school_id`, `phone`)
);
CREATE TABLE IF NOT EXISTS `khotwa_login_limits` (
 `id` text PRIMARY KEY NOT NULL,
 `attempts` integer NOT NULL DEFAULT 0,
 `blocked_until` integer NOT NULL DEFAULT 0,
 `updated_at` integer NOT NULL
);
INSERT OR IGNORE INTO `khotwa_schools` (`id`,`code`,`name`,`active`,`created_at`)
VALUES ('default','MAIN','المدرسة الحالية',1,'2026-11-19T00:00:00.000Z');
