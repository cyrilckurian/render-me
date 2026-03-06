
CREATE TABLE public.style_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  sample_urls TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.style_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own style requests"
  ON public.style_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own style requests"
  ON public.style_requests FOR SELECT
  USING (auth.uid() = user_id);
