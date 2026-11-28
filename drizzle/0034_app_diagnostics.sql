-- App diagnostics (read by the system administrator only) and the release information the app checks for updates.
--
--   khotwa_app_issues   one row per distinct problem the website or the app reported about itself (a script error, a
--                       failed request, a screen that crashed), counted instead of listed again and again.
--   khotwa_app_issue_accounts   which accounts met a problem, so the page can say "3 people" instead of "40 times".
--   khotwa_app_devices  the latest state of the phone or browser of an account that needs it to work: what the app
--                       version is, and whether location / notifications / camera are allowed.
--   khotwa_app_releases the newest and the oldest-still-allowed app version per platform, set by the administrator.
--
-- Nothing here holds a position, an IP address, a device identifier, a name, or what a person typed or saw. A message is
-- cut to a short length and has numbers that look like phone numbers, e-mail addresses and long ids removed before it
-- is stored (lib/app-diagnostics.ts).
CREATE TABLE IF NOT EXISTS khotwa_app_issues (
  fingerprint TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('script', 'promise', 'api', 'render', 'native')),
  message TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'android', 'ios')),
  app_version TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  occurrences INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  resolved_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_khotwa_app_issues_seen ON khotwa_app_issues(last_seen);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS khotwa_app_issue_accounts (
  fingerprint TEXT NOT NULL,
  account_key TEXT NOT NULL,
  PRIMARY KEY (fingerprint, account_key)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS khotwa_app_devices (
  account_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'android', 'ios')),
  role TEXT NOT NULL,
  school_id TEXT NOT NULL DEFAULT '',
  app_version TEXT NOT NULL DEFAULT '',
  os_version TEXT NOT NULL DEFAULT '',
  device_model TEXT NOT NULL DEFAULT '',
  location_permission TEXT NOT NULL DEFAULT 'unknown',
  background_location TEXT NOT NULL DEFAULT 'unknown',
  notifications TEXT NOT NULL DEFAULT 'unknown',
  camera TEXT NOT NULL DEFAULT 'unknown',
  battery_saver TEXT NOT NULL DEFAULT 'unknown',
  reported_at TEXT NOT NULL,
  PRIMARY KEY (account_key, channel)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_khotwa_app_devices_reported ON khotwa_app_devices(reported_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS khotwa_app_releases (
  platform TEXT PRIMARY KEY CHECK (platform IN ('android', 'ios')),
  latest_version TEXT NOT NULL,
  minimum_version TEXT NOT NULL,
  store_url TEXT NOT NULL DEFAULT '',
  notes_ar TEXT NOT NULL DEFAULT '',
  notes_en TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
