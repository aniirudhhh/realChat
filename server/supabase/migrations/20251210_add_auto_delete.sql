-- Add auto_delete_preference column to chats table
ALTER TABLE chats 
ADD COLUMN IF NOT EXISTS auto_delete_preference TEXT DEFAULT 'off';

-- Add check constraint to ensure valid values
ALTER TABLE chats 
ADD CONSTRAINT check_auto_delete_preference 
CHECK (auto_delete_preference IN ('off', 'close', '24h', '7d'));

-- Add auto_delete_updated_at column to track changes
ALTER TABLE chats 
ADD COLUMN IF NOT EXISTS auto_delete_updated_at TIMESTAMPTZ DEFAULT NOW();
