-- Cafeteria products can carry the barcode printed on the item itself, so receiving stock is a scan and a quantity.
--
-- The barcode is optional and belongs to one cafeteria's item: two cafeterias may sell the same packaged product,
-- but one cafeteria cannot give the same code to two items (the partial unique index below). Codes are stored
-- normalized (digits and upper-case letters only) by lib/fushati/barcode.ts.
ALTER TABLE fushati_menu_items ADD COLUMN barcode TEXT CHECK(barcode IS NULL OR (length(barcode)>=4 AND length(barcode)<=32));
CREATE UNIQUE INDEX IF NOT EXISTS fushati_menu_barcode_idx ON fushati_menu_items(cafeteria_id,barcode) WHERE barcode IS NOT NULL;
