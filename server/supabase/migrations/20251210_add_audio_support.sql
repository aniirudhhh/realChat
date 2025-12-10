-- Add audio_url column
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS audio_url TEXT;

-- Update type check constraint to include 'audio'
-- Note: We have to drop the old constraint first as Postgres doesn't allow direct modification of check constraints
ALTER TABLE messages DROP CONSTRAINT IF EXISTS check_message_type;

ALTER TABLE messages 
ADD CONSTRAINT check_message_type 
CHECK (type IN ('text', 'image', 'system', 'audio'));
