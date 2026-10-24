-- Foundation schema: households, people, devices, keys, token ledger.
-- Catalog and Print Shop tables arrive in later migrations.

CREATE TABLE households (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE adults (
  email         TEXT PRIMARY KEY,               -- stored lowercase
  name          TEXT,
  role          TEXT NOT NULL DEFAULT 'adult' CHECK (role IN ('owner', 'adult')),
  household_id  TEXT REFERENCES households(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE kids (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  name          TEXT NOT NULL,
  birth_year    INTEGER,
  emoji         TEXT,                           -- fallback avatar
  color         TEXT,                           -- tile colour, hex
  avatar_key    TEXT,                           -- R2 key of photo
  ui_mode       TEXT NOT NULL DEFAULT 'picture' CHECK (ui_mode IN ('picture', 'reader')),
  active        INTEGER NOT NULL DEFAULT 1,
  sort          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX kids_household ON kids(household_id);

CREATE TABLE devices (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  name          TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen     TEXT,
  revoked_at    TEXT
);

CREATE TABLE pairing_codes (
  code          TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  device_name   TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  used_at       TEXT
);

CREATE TABLE api_keys (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,
  scopes      TEXT NOT NULL DEFAULT 'award',     -- comma-separated
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at  TEXT
);

-- Append-only token ledger. Balance = SUM(delta) per kid.
CREATE TABLE ledger (
  id          TEXT PRIMARY KEY,
  kid_id      TEXT NOT NULL REFERENCES kids(id),
  delta       INTEGER NOT NULL CHECK (delta <> 0),
  kind        TEXT NOT NULL CHECK (kind IN ('award', 'spend', 'refund', 'adjust')),
  reason      TEXT,
  ref_type    TEXT,                             -- e.g. 'print_request'
  ref_id      TEXT,
  actor       TEXT NOT NULL,                    -- adult email, 'device:<id>', 'key:<name>'
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ledger_kid ON ledger(kid_id, created_at);

CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;

CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
