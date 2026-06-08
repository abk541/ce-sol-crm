ALTER TABLE public.fresh_awards
  ADD COLUMN IF NOT EXISTS proposal_attachments JSONB DEFAULT '[]'::jsonb;
