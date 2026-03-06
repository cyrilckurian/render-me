
CREATE TABLE public.render_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  render_id UUID,
  user_id UUID,
  rating TEXT NOT NULL,
  expectation TEXT,
  reality TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.render_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own feedback"
ON public.render_feedback FOR INSERT
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can view their own feedback"
ON public.render_feedback FOR SELECT
USING (auth.uid() = user_id);
