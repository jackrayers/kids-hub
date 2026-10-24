-- A tablet can belong to the whole household (kid_id NULL) or be locked to one kid.
ALTER TABLE devices ADD COLUMN kid_id TEXT REFERENCES kids(id);
ALTER TABLE pairing_codes ADD COLUMN kid_id TEXT REFERENCES kids(id);
