CREATE POLICY "Users can delete their own style requests"
  ON public.style_requests FOR DELETE
  USING (auth.uid() = user_id);
