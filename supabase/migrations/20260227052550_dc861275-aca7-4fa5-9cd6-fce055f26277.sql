CREATE POLICY "Users can update their own renders"
ON public.renders
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);