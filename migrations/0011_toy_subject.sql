-- What the storybook picture should show: 'auto' (decide from the photo), 'toy' (take the
-- toy out of its box), or 'box' (draw the box itself — board games, puzzles, books, kits).
ALTER TABLE toys ADD COLUMN subject TEXT NOT NULL DEFAULT 'auto';
