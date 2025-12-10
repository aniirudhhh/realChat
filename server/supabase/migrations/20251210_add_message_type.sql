-- Add type column to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'text';

-- Add check constraint to ensure valid values
ALTER TABLE messages 
ADD CONSTRAINT check_message_type 
CHECK (type IN ('text', 'image', 'system'));
