-- Make bucket private
UPDATE storage.buckets SET public = false WHERE id = 'floor-plans';

-- Drop the existing broad public SELECT policy
DROP POLICY IF EXISTS "Anyone can view floor plan images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view floor plans" ON storage.objects;

-- Users can view their own files (path format: originals/user_id/... or renders/user_id/...)
CREATE POLICY "Users can view their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'floor-plans'
  AND (string_to_array(name, '/'))[2] = auth.uid()::text
);

-- Users can delete their own files
CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'floor-plans'
  AND (string_to_array(name, '/'))[2] = auth.uid()::text
);

-- Users can update their own files
CREATE POLICY "Users can update their own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'floor-plans'
  AND (string_to_array(name, '/'))[2] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'floor-plans'
  AND (string_to_array(name, '/'))[2] = auth.uid()::text
);