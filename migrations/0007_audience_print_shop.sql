-- Who can see a toy or model. No rows = everyone. Otherwise visible to the listed
-- households (kid_id NULL) and/or the listed kids.
CREATE TABLE item_audience (
  item_type     TEXT NOT NULL CHECK (item_type IN ('toy', 'model')),
  item_id       TEXT NOT NULL,
  household_id  TEXT REFERENCES households(id),
  kid_id        TEXT REFERENCES kids(id),
  CHECK ((household_id IS NULL) <> (kid_id IS NULL))
);
CREATE INDEX item_audience_item ON item_audience(item_type, item_id);

-- Print Shop -----------------------------------------------------------------

CREATE TABLE filaments (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  hex         TEXT NOT NULL,
  material    TEXT NOT NULL DEFAULT 'PLA',
  in_stock    INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE models (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  source_url    TEXT,
  file_key      TEXT NOT NULL,             -- R2: the PrusaSlicer project .3mf
  file_name     TEXT,
  preview_key   TEXT,                      -- R2: light mesh for the kids' viewer
  thumb_key     TEXT,                      -- R2: transparent thumbnail
  slots         TEXT NOT NULL DEFAULT '[]', -- JSON [{ extruder, name, hex, share }]
  size_mm       TEXT,                      -- JSON [x, y, z]
  price_single  INTEGER NOT NULL DEFAULT 5,
  price_multi   INTEGER NOT NULL DEFAULT 8,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'hidden')),
  sort          INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE print_requests (
  id             TEXT PRIMARY KEY,
  kid_id         TEXT NOT NULL REFERENCES kids(id),
  model_id       TEXT NOT NULL REFERENCES models(id),
  colors         TEXT NOT NULL,            -- JSON [{ extruder, slot, filament_id, name, hex }]
  multi          INTEGER NOT NULL,
  cost           INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'printing', 'done', 'refunded')),
  refund_reason  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX print_requests_status ON print_requests(status, created_at);
CREATE INDEX print_requests_kid ON print_requests(kid_id, created_at);
