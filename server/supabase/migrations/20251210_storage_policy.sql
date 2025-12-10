-- Enable RLS on storage.objects (usually enabled by default)
-- Policy: Allow public read access to audio-messages
CREATE POLICY "Public Access Audio"
ON storage.objects FOR SELECT
USING ( bucket_id = 'audio-messages' );

-- Policy: Allow authenticated users to upload to audio-messages
CREATE POLICY "Authenticated Upload Audio"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'audio-messages' );

-- Policy: Allow users to delete their own files (or all files for now if simplistic)
-- We'll restrict to authenticated for now. 
CREATE POLICY "Authenticated Delete Audio"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'audio-messages' );
