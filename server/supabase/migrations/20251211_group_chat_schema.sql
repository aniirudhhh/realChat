-- Add Group Chat capabilities to chats table
ALTER TABLE chats 
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS photo_url TEXT,
ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS admin_ids JSONB DEFAULT '[]'::jsonb;

-- Comment on columns
COMMENT ON COLUMN chats.name IS 'Name of the group chat (nullable for 1:1)';
COMMENT ON COLUMN chats.photo_url IS 'URL of the group chat photo';
COMMENT ON COLUMN chats.is_group IS 'Distinguishes 1:1 chats from Group chats';
COMMENT ON COLUMN chats.admin_ids IS 'JSON Array of User IDs who are admins';
