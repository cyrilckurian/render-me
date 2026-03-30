
-- Create compositions table for edit sessions
CREATE TABLE public.compositions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  original_image_path TEXT NOT NULL,
  original_file_name TEXT NOT NULL DEFAULT 'render.png',
  result_image_path TEXT,
  regions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  title TEXT NOT NULL DEFAULT 'Untitled Composition',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.compositions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own compositions"
  ON public.compositions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own compositions"
  ON public.compositions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own compositions"
  ON public.compositions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own compositions"
  ON public.compositions FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_compositions_updated_at
  BEFORE UPDATE ON public.compositions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
