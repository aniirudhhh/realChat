-- Enable replication for message_reactions
ALTER TABLE message_reactions REPLICA IDENTITY FULL;

-- Add to publication
ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
