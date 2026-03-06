CREATE POLICY "Users can delete their own renders"
ON public.renders
FOR DELETE
USING (auth.uid() = user_id);