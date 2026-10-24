-- Web Push alerts for grown-ups (Print Shop requests, test pings).
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE TABLE push_subscriptions (
  id            TEXT PRIMARY KEY,
  adult_email   TEXT NOT NULL REFERENCES adults(email) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  label         TEXT,                        -- e.g. "iPhone", from the browser
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_sent_at  TEXT
);
CREATE INDEX push_subscriptions_adult ON push_subscriptions(adult_email);
