-- Removing a kid: kids with star or print history are kept (the ledger is append-only)
-- but marked deleted and hidden everywhere; kids with no history are deleted outright.
ALTER TABLE kids ADD COLUMN deleted_at TEXT;
