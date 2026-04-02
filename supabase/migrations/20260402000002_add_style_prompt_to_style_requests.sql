-- Add style_prompt column to style_requests so extracted text prompts can be stored
-- and reused for future renders without re-running the expensive style extraction step.
ALTER TABLE public.style_requests
  ADD COLUMN IF NOT EXISTS style_prompt TEXT;
