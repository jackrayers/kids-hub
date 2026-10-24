-- Per-kid app switches. A missing row means the app's default (see lib/apps.js).
CREATE TABLE kid_apps (
  kid_id      TEXT NOT NULL REFERENCES kids(id),
  app         TEXT NOT NULL,
  enabled     INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  updated_by  TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kid_id, app)
);
