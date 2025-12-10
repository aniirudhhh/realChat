-- Create a new private bucket for image messages if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('image-messages', 'image-messages', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects (usually enabled by default)

-- Policy: Allow public read access to image-messages
CREATE POLICY "Public Access Images"
ON storage.objects FOR SELECT
USING ( bucket_id = 'image-messages' );

-- Policy: Allow authenticated users to upload to image-messages
CREATE POLICY "Authenticated Upload Images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'image-messages' );

-- Policy: Allow authenticated users to delete from image-messages
CREATE POLICY "Authenticated Delete Images"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'image-messages' );
