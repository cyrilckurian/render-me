
-- =====================================================
-- REVIEW FEATURE: Tables, RLS, Storage
-- =====================================================

-- 1. review_projects: owned by a designer
CREATE TABLE public.review_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Project',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.review_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can manage their review projects" ON public.review_projects FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_review_projects_updated_at
  BEFORE UPDATE ON public.review_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. review_files: files (images/PDFs) uploaded to a project
CREATE TABLE public.review_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.review_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'image' | 'pdf'
  storage_path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'upload', -- 'upload' | 'google_drive'
  drive_file_id TEXT,
  page_count INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.review_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can manage their review files" ON public.review_files FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. review_pages: each page of each file (images = 1 page, PDFs = N pages)
CREATE TABLE public.review_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES public.review_files(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.review_projects(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL DEFAULT 1,
  image_path TEXT NOT NULL, -- stored rasterized image path
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.review_pages ENABLE ROW LEVEL SECURITY;
-- Owner access via project ownership
CREATE POLICY "Owners can manage their review pages" ON public.review_pages FOR ALL USING (
  EXISTS (SELECT 1 FROM public.review_projects rp WHERE rp.id = project_id AND rp.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.review_projects rp WHERE rp.id = project_id AND rp.user_id = auth.uid())
);

-- 4. review_links: named reviewer links (one per reviewer per project)
CREATE TABLE public.review_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.review_projects(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.review_links ENABLE ROW LEVEL SECURITY;
-- Owner can CRUD their links
CREATE POLICY "Owners can manage their review links" ON public.review_links FOR ALL USING (
  EXISTS (SELECT 1 FROM public.review_projects rp WHERE rp.id = project_id AND rp.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.review_projects rp WHERE rp.id = project_id AND rp.user_id = auth.uid())
);
-- Guests can read a link by token (for validation)
CREATE POLICY "Anyone can read a review link by token" ON public.review_links FOR SELECT USING (true);

-- 5. review_comments: comments + annotations from reviewers
CREATE TABLE public.review_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES public.review_pages(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.review_projects(id) ON DELETE CASCADE,
  link_id UUID NOT NULL REFERENCES public.review_links(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL,
  comment_text TEXT,
  voice_path TEXT, -- optional voice recording storage path
  annotation_rect JSONB, -- { x, y, width, height } as % of image dimensions (nullable = whole-page comment)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;

-- Security definer function to check if a token belongs to a link
CREATE OR REPLACE FUNCTION public.review_link_token_matches(p_link_id UUID, p_token TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.review_links WHERE id = p_link_id AND token = p_token
  )
$$;

-- Guests (identified by link_id) can insert comments if link_id matches project
CREATE POLICY "Link holders can insert comments" ON public.review_comments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.review_links rl WHERE rl.id = link_id AND rl.project_id = project_id)
);
-- Guests can read only their own link's comments
CREATE POLICY "Link holders can read own comments" ON public.review_comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.review_links rl WHERE rl.id = link_id)
);
-- Project owners can read all comments on their projects
CREATE POLICY "Owners can read all comments on their projects" ON public.review_comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.review_projects rp WHERE rp.id = project_id AND rp.user_id = auth.uid())
);

-- 6. Storage bucket for review uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('review-files', 'review-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for review-files bucket
CREATE POLICY "Owners can upload review files" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'review-files' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "Owners can read their own review files" ON storage.objects FOR SELECT USING (
  bucket_id = 'review-files' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "Owners can delete their own review files" ON storage.objects FOR DELETE USING (
  bucket_id = 'review-files' AND auth.uid()::text = (storage.foldername(name))[1]
);
-- Allow guests to read review-files via guest path
CREATE POLICY "Guests can read guest-scoped review files" ON storage.objects FOR SELECT USING (
  bucket_id = 'review-files' AND (storage.foldername(name))[1] = 'guest'
);
-- Allow guests to upload voice recordings
CREATE POLICY "Guests can upload voice recordings" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'review-files' AND (storage.foldername(name))[1] = 'guest'
);
