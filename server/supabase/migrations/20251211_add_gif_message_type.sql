-- Add 'gif' to the allowed message types
-- First drop the existing constraint, then add the new one with 'gif' included

ALTER TABLE messages DROP CONSTRAINT IF EXISTS check_message_type;

ALTER TABLE messages ADD CONSTRAINT check_message_type 
  CHECK (type IS NULL OR type IN ('text', 'image', 'system', 'audio', 'gif'));
