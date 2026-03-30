
-- Allow anyone (anon) to read review pages if the project has a review link
CREATE POLICY "Anyone can read review pages via link"
  ON public.review_pages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.review_links rl
      WHERE rl.project_id = review_pages.project_id
    )
  );

-- Allow anyone to create signed URLs for review-files storage objects
CREATE POLICY "Anyone can read review files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'review-files');
