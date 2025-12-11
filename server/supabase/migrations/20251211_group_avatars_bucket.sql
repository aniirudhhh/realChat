-- Create a new public bucket for group avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('group-avatars', 'group-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow public read access
CREATE POLICY "Public Access Group Avatars"
ON storage.objects FOR SELECT
USING ( bucket_id = 'group-avatars' );

-- Policy: Allow authenticated users to upload
CREATE POLICY "Authenticated Upload Group Avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'group-avatars' );

-- Policy: Allow authenticated users to update (replace)
CREATE POLICY "Authenticated Update Group Avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'group-avatars' );

-- Policy: Allow authenticated users to delete
CREATE POLICY "Authenticated Delete Group Avatars"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'group-avatars' );
