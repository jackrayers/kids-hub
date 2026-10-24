-- Shopping list for grown-ups: mark wish-list items as bought (never shown to kids).
-- If a kid takes a bought item off their list, the row stays (removed_at set) so the purchase isn't forgotten.
ALTER TABLE wishlist ADD COLUMN bought_by TEXT;
ALTER TABLE wishlist ADD COLUMN bought_at TEXT;
ALTER TABLE wishlist ADD COLUMN removed_at TEXT;
