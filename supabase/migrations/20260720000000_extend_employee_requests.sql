-- Store the scheduling and role metadata used by the HR request dashboard.
ALTER TABLE public.employee_requests
  ADD COLUMN IF NOT EXISTS requester_role TEXT,
  ADD COLUMN IF NOT EXISTS deadline DATE,
  ADD COLUMN IF NOT EXISTS leave_start DATE,
  ADD COLUMN IF NOT EXISTS leave_end DATE;

NOTIFY pgrst, 'reload schema';
