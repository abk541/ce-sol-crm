-- Persist the proposal file(s) on the contract row so the proposal stays
-- with the contract throughout its lifecycle, independently of the source
-- opportunity record.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS proposal_attachments JSONB DEFAULT '[]'::jsonb;
