ALTER TABLE receipt_items ADD COLUMN quantity REAL NOT NULL DEFAULT 1;
ALTER TABLE receipt_items ADD COLUMN unit_price REAL NOT NULL DEFAULT 0;

UPDATE receipt_items
SET unit_price = line_total
WHERE unit_price = 0;
