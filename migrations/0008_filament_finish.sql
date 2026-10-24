-- Patterned filaments: finish (solid, matte, silk, marble, sparkle, rainbow, wood, glow)
-- and an optional second color (veins, flecks, grain, dual silk).
ALTER TABLE filaments ADD COLUMN finish TEXT NOT NULL DEFAULT 'solid';
ALTER TABLE filaments ADD COLUMN hex2 TEXT;
