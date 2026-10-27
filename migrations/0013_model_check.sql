-- Print Shop intake from MakerWorld/Bambu files: the designer's own preview picture,
-- who made it and under what licence, and the "will it print in one go?" estimate.
ALTER TABLE models ADD COLUMN ref_key TEXT;
ALTER TABLE models ADD COLUMN designer TEXT;
ALTER TABLE models ADD COLUMN license TEXT;
ALTER TABLE models ADD COLUMN print_check TEXT; -- JSON from printCheck() in public/shared/threemf.js
