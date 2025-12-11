-- Add joined_at timestamp to chat_participants for history tracking
ALTER TABLE chat_participants 
ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill existing participants with created_at of the chat or row creation
-- Since we don't track when they joined previously, simple backfill is needed to show history
-- However, for NEW logic, we want joined_at.
-- We can default existing rows to row creation time if available, or NOW() if we want to risk hiding history (bad).
-- Best approach: Backfill with a far past date OR the chat's creation date if possible.
-- But since this is a new column on an existing table, existing rows will get NOW().
-- We want existing users to see ALL history. New users (added later) see only from NOW.
-- So, update existing rows to be "old".

UPDATE chat_participants SET joined_at = '2000-01-01 00:00:00+00' WHERE joined_at >= NOW() - INTERVAL '1 minute';
-- Note: The above update is a rough heuristic. 
-- Better: Set default to NOW(). 
-- For existing rows, we likely want them to see history.
-- Actually, a better approach for the COLUMN definition:
-- DEFAULT NOW().
-- Then UPDATE all current rows to be older.
