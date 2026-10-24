-- Toy categories become editable (were hard-coded in lib/catalog.js). Same ids, so
-- existing toys keep their category. 'other' is the fallback and can't be deleted.
CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '🎁',
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO categories (id, name, icon, sort) VALUES
  ('building', 'Building', '🧱', 10),
  ('cuddly', 'Dolls & cuddly', '🧸', 20),
  ('vehicles', 'Cars & trains', '🚂', 30),
  ('pretend', 'Pretend play', '👑', 40),
  ('arts', 'Arts & crafts', '🎨', 50),
  ('games', 'Games & puzzles', '🎲', 60),
  ('outdoor', 'Outdoor & active', '⚽', 70),
  ('books', 'Books', '📚', 80),
  ('other', 'Other', '🎁', 1000);
