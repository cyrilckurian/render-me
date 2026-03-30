CREATE TABLE public.composer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Untitled Mood Board',
  base_sketch_path text,
  regions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  variations_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.composer_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own composer sessions"
  ON public.composer_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own composer sessions"
  ON public.composer_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own composer sessions"
  ON public.composer_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own composer sessions"
  ON public.composer_sessions FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER set_composer_updated_at
  BEFORE UPDATE ON public.composer_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();