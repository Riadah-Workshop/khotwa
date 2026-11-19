-- Safe, admin-visible email diagnostic code. Never store SMTP passwords or tokens here.
ALTER TABLE khotwa_accounts ADD COLUMN invitation_error_code TEXT;
