-- User-approved adoption of the two pending nine-digit source numbers.
-- Resolve identities only: never update students, mobile numbers, classes, or prior records.
WITH approved(review_id,student_id) AS (VALUES ('2a63cba0-434c-4f71-b48f-3d86b0f78c7e','a3dd65b5-261b-4602-bd23-929767ec94cf'),('4dc42622-55a5-45b5-b4f2-a5c41e719759','b2e2a9a0-35a5-516b-90a3-561461b9168a'))
INSERT INTO student_identities(student_id,identity_number,actor,updated_at)
SELECT s.id,r.source_number,'عايض آل ثقفان — اعتماد رقم من ٩ خانات',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM student_identity_reviews r JOIN approved a ON a.review_id=r.id AND a.student_id=r.student_id
JOIN students s ON s.id=a.student_id
WHERE r.status='pending' AND r.revision=1 AND s.active=1 AND replace(replace(replace(replace(replace(replace(replace(s.name,' ',''),'أ','ا'),'إ','ا'),'آ','ا'),'ى','ي'),'ة','ه'),'ـ','')=replace(replace(replace(replace(replace(replace(replace(r.source_name,' ',''),'أ','ا'),'إ','ا'),'آ','ا'),'ى','ي'),'ة','ه'),'ـ','')
AND length(r.source_number)=9 AND r.source_number NOT GLOB '*[^0-9]*'
AND NOT EXISTS(SELECT 1 FROM student_identities i WHERE i.student_id=s.id OR i.identity_number=r.source_number)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
WITH approved(review_id,student_id) AS (VALUES ('2a63cba0-434c-4f71-b48f-3d86b0f78c7e','a3dd65b5-261b-4602-bd23-929767ec94cf'),('4dc42622-55a5-45b5-b4f2-a5c41e719759','b2e2a9a0-35a5-516b-90a3-561461b9168a'))
UPDATE student_identity_reviews AS r
SET status=CASE WHEN EXISTS(SELECT 1 FROM students s WHERE s.id=r.student_id AND s.grade=r.source_grade AND s.classroom=r.source_classroom) THEN 'done' ELSE 'pending' END,
reason=CASE WHEN EXISTS(SELECT 1 FROM students s WHERE s.id=r.student_id AND s.grade=r.source_grade AND s.classroom=r.source_classroom) THEN 'اعتمد المستخدم الرقم الأصلي من ٩ خانات' ELSE 'تم اعتماد الهوية من ٩ خانات؛ بقي تأكيد الصف والفصل' END,
actor='عايض آل ثقفان — اعتماد رقم من ٩ خانات',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),revision=revision+1
WHERE r.id IN(SELECT review_id FROM approved WHERE student_id=r.student_id)
AND r.status='pending' AND r.revision=1 AND length(r.source_number)=9 AND r.source_number NOT GLOB '*[^0-9]*'
AND EXISTS(SELECT 1 FROM student_identities i JOIN students s ON s.id=i.student_id WHERE i.student_id=r.student_id AND i.identity_number=r.source_number AND s.active=1 AND replace(replace(replace(replace(replace(replace(replace(s.name,' ',''),'أ','ا'),'إ','ا'),'آ','ا'),'ى','ي'),'ة','ه'),'ـ','')=replace(replace(replace(replace(replace(replace(replace(r.source_name,' ',''),'أ','ا'),'إ','ا'),'آ','ا'),'ى','ي'),'ة','ه'),'ـ',''));
