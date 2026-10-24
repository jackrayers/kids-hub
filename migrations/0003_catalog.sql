-- Santa's Catalog: toys (with generated images) and each kid's wish list.
CREATE TABLE toys (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  source_url    TEXT,                          -- product page it was imported from
  source_key    TEXT,                          -- R2: original product photo
  stylized_key  TEXT,                          -- R2: storybook illustration shown to kids
  coloring_key  TEXT,                          -- R2: black-and-white outline for the letter
  category      TEXT NOT NULL DEFAULT 'other',
  sort          INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'hidden')),
  gen_error     TEXT,                          -- last image-generation error, if any
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX toys_status ON toys(status, category, sort);

CREATE TABLE wishlist (
  kid_id    TEXT NOT NULL REFERENCES kids(id),
  toy_id    TEXT NOT NULL REFERENCES toys(id),
  added_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kid_id, toy_id)
);
