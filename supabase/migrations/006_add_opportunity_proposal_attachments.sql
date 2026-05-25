-- Store uploaded proposal files as attachment metadata/data so they can be
-- viewed from Contract Admin after submission.
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS proposal_attachments JSONB DEFAULT '[]'::jsonb;
