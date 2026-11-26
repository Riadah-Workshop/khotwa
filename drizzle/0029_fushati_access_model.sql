-- 0029: Fushati access model. Additive: nothing is removed or rewritten except the new columns' values.
--
-- * alias: the only name a cafeteria administrator may change. The official name, the school and the
--   bank details stay with the system administrator.
-- * permissions: what a user may do in one cafeteria, as a JSON array of known permission names.
--   Cafeteria administrators and the system administrator get every permission from their role, so
--   the column only matters for cafeteria agents ("supervisors" are agents with more permissions).
ALTER TABLE fushati_cafeterias ADD COLUMN alias TEXT NOT NULL DEFAULT '';
ALTER TABLE fushati_assignments ADD COLUMN permissions TEXT NOT NULL DEFAULT '[]';
-- Agents keep exactly what they could do before: sell at the counter and propose menu items.
UPDATE fushati_assignments SET permissions='["pos","menu_propose"]' WHERE user_id IN (SELECT id FROM fushati_users WHERE role='fushati_agent');
-- Until now a cafeteria administrator reached every cafeteria. Access is now by assignment, so existing
-- administrators are assigned to the cafeterias that exist today (nobody is locked out on deployment).
-- The system administrator then removes the ones that are not theirs. Cafeterias created from now on
-- are reachable only by the administrators assigned to them.
INSERT OR IGNORE INTO fushati_assignments(user_id,cafeteria_id,permissions) SELECT u.id,c.id,'["*"]' FROM fushati_users u CROSS JOIN fushati_cafeterias c WHERE u.role='fushati_admin';
UPDATE fushati_assignments SET permissions='["*"]' WHERE user_id IN (SELECT id FROM fushati_users WHERE role='fushati_admin');
