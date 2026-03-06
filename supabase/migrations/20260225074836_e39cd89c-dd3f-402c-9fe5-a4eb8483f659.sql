
-- Storage bucket for floor plan uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('floor-plans', 'floor-plans', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload floor plans"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'floor-plans');

CREATE POLICY "Anyone can view floor plan images"
ON storage.objects FOR SELECT
USING (bucket_id = 'floor-plans');

-- Renders table (stores all render history)
CREATE TABLE public.renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  floor_plan_path TEXT NOT NULL,
  floor_plan_name TEXT NOT NULL,
  style_id TEXT NOT NULL,
  style_name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.renders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own renders"
ON public.renders FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own renders"
ON public.renders FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Custom styles table
CREATE TABLE public.custom_styles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_styles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own custom styles"
ON public.custom_styles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own custom styles"
ON public.custom_styles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
