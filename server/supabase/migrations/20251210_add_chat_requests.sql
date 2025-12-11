-- Add status and created_by to chats table

ALTER TABLE public.chats 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('active', 'request', 'blocked')),
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Update RLS if necessary (assuming existing policies cover update if participant)
-- We might need to ensure 'created_by' is set for existing chats?
-- For existing chats, we can assume 'active' (default) and created_by is NULL (allowable).
-- Or we can try to backfill, but it's hard to know who created. NULL is fine for legacy.
