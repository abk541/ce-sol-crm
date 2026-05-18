-- =====================================================================
-- CE Solution Plus CRM — Full Schema
-- Run this in your Supabase SQL editor (Dashboard > SQL Editor > New query)
-- =====================================================================

-- Employees (3-tier hierarchy)
CREATE TABLE IF NOT EXISTS public.employees (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  role          TEXT NOT NULL CHECK (role IN ('BD_MANAGER','TEAM_LEAD','ASSOCIATE')),
  manager_id    TEXT REFERENCES public.employees(id) ON DELETE SET NULL,
  department    TEXT,
  avatar        TEXT NOT NULL DEFAULT ''
);

-- CRM Users (system login accounts)
CREATE TABLE IF NOT EXISTS public.users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  username      TEXT UNIQUE NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('BD_MANAGER','TEAM_LEAD','ASSOCIATE')),
  avatar        TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  first_login   BOOLEAN NOT NULL DEFAULT true,
  mfa_enabled   BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  password      TEXT
);

-- Opportunities
CREATE TABLE IF NOT EXISTS public.opportunities (
  id                      TEXT PRIMARY KEY,
  solicitation            TEXT NOT NULL,
  solicitation_id         TEXT,
  client                  TEXT,
  type                    TEXT,
  naics_code              TEXT,
  set_aside               TEXT,
  priority                TEXT,
  status                  TEXT,
  due_date                TEXT,
  local_time              TEXT,
  timezone                TEXT,
  location                TEXT,
  pop                     TEXT,
  bdm                     TEXT,
  bds                     TEXT,
  support_agent           TEXT,
  poc                     TEXT,
  contract_amount         NUMERIC,
  base_amount             NUMERIC,
  monthly_payment         NUMERIC,
  value                   NUMERIC,
  period                  TEXT,
  captured_on             TEXT,
  mandatory_events        TEXT,
  link                    TEXT,
  is_deleted              BOOLEAN DEFAULT false,
  deletion_requested      BOOLEAN DEFAULT false,
  submitted_at            TIMESTAMPTZ,
  non_submission_report_id TEXT,
  assigned_to             TEXT REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Comments (on opportunities)
CREATE TABLE IF NOT EXISTS public.comments (
  id              TEXT PRIMARY KEY,
  opportunity_id  TEXT REFERENCES public.opportunities(id) ON DELETE CASCADE,
  text            TEXT NOT NULL,
  author          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Contracts
CREATE TABLE IF NOT EXISTS public.contracts (
  id                  TEXT PRIMARY KEY,
  contract_id         TEXT NOT NULL,
  title               TEXT NOT NULL,
  type                TEXT,
  finance_type        TEXT,
  naics_code          TEXT,
  set_aside           TEXT,
  status              TEXT NOT NULL,
  location            TEXT,
  client              TEXT,
  pop_start           TEXT,
  pop_end             TEXT,
  value               NUMERIC,
  base_amount         NUMERIC,
  monthly_payment     NUMERIC,
  spm                 TEXT,
  pm                  TEXT,
  bds                 TEXT,
  bdm                 TEXT,
  support_agent       TEXT,
  opportunity_id      TEXT REFERENCES public.opportunities(id) ON DELETE SET NULL,
  billing_notes       TEXT,
  follow_up_date      TEXT,
  option_years        INTEGER,
  option_year_deadline TEXT,
  deliverables        TEXT[],
  termination_type    TEXT,
  termination_date    TEXT,
  termination_reason  TEXT,
  assigned_to         TEXT REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Contract Points of Contact
CREATE TABLE IF NOT EXISTS public.contract_pocs (
  id            TEXT PRIMARY KEY,
  contract_id   TEXT NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('KO','COR','END_USER')),
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  notes         TEXT,
  contacted_at  TEXT
);

-- Locked Subcontractors (on contracts)
CREATE TABLE IF NOT EXISTS public.locked_subcontractors (
  id               TEXT PRIMARY KEY,
  contract_id      TEXT NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  company_name     TEXT NOT NULL,
  contact_name     TEXT,
  email            TEXT,
  phone            TEXT,
  set_aside        TEXT,
  naics_code       TEXT,
  subk_database_id TEXT,
  invoices         TEXT[],
  sub_agreements   TEXT[],
  quotes           TEXT[],
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  created_by       TEXT
);

-- Government Warnings
CREATE TABLE IF NOT EXISTS public.government_warnings (
  id           TEXT PRIMARY KEY,
  contract_id  TEXT NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('CURE_NOTICE','LETTER_OF_CONCERN','NCR','SHOW_CAUSE','STOP_WORK_ORDER')),
  issued_date  TEXT,
  description  TEXT,
  severity     TEXT CHECK (severity IN ('RED','YELLOW','INFO')),
  resolved_at  TIMESTAMPTZ,
  resolved_note TEXT
);

-- Fresh Awards
CREATE TABLE IF NOT EXISTS public.fresh_awards (
  id                      TEXT PRIMARY KEY,
  bd_submission_id        INTEGER,
  opportunity_id          TEXT REFERENCES public.opportunities(id) ON DELETE SET NULL,
  solicitation            TEXT NOT NULL,
  solicitation_id         TEXT,
  client                  TEXT,
  type                    TEXT,
  set_aside               TEXT,
  naics_code              TEXT,
  contract_amount         NUMERIC,
  base_amount             NUMERIC,
  monthly_payment         NUMERIC,
  pop                     TEXT,
  location                TEXT,
  awarded_date            TEXT,
  assigned_bdm            TEXT,
  assigned_bds            TEXT,
  assigned_spm            TEXT,
  assigned_pm             TEXT,
  assigned_support_agent  TEXT,
  status                  TEXT NOT NULL DEFAULT 'PENDING_ASSIGNMENT' CHECK (status IN ('PENDING_ASSIGNMENT','ASSIGNED','MOVED_TO_ACTIVE')),
  contract_id             TEXT,
  moved_at                TIMESTAMPTZ,
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Past Performances
CREATE TABLE IF NOT EXISTS public.past_performances (
  id               TEXT PRIMARY KEY,
  opportunity_id   TEXT,
  contract_id      TEXT,
  contract_number  TEXT NOT NULL,
  title            TEXT NOT NULL,
  client           TEXT,
  type             TEXT,
  finance_type     TEXT,
  naics_code       TEXT,
  set_aside        TEXT,
  value            NUMERIC,
  pop_start        TEXT,
  pop_end          TEXT,
  location         TEXT,
  description      TEXT,
  relevance        TEXT,
  key_personnel    TEXT,
  challenges       TEXT,
  bdm              TEXT,
  bds              TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  created_by       TEXT
);

-- Subcontractors (attached to opportunities)
CREATE TABLE IF NOT EXISTS public.subcontractors (
  id              TEXT PRIMARY KEY,
  opportunity_id  TEXT REFERENCES public.opportunities(id) ON DELETE CASCADE,
  company_name    TEXT NOT NULL,
  contact_name    TEXT,
  email           TEXT,
  phone           TEXT,
  naics_code      TEXT,
  set_aside       TEXT,
  notes           TEXT,
  quote_file      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      TEXT
);

-- Subcontractor Database (global registry)
CREATE TABLE IF NOT EXISTS public.subk_database (
  id                      TEXT PRIMARY KEY,
  company_name            TEXT NOT NULL,
  contact_name            TEXT,
  email                   TEXT,
  phone                   TEXT,
  naics_codes             TEXT[],
  set_aside               TEXT,
  notes                   TEXT,
  total_contracts_worked  INTEGER DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  created_by              TEXT
);

-- Non-Submission Reports
CREATE TABLE IF NOT EXISTS public.non_submission_reports (
  id               TEXT PRIMARY KEY,
  opportunity_id   TEXT REFERENCES public.opportunities(id) ON DELETE CASCADE,
  agent_username   TEXT,
  reason           TEXT,
  status           TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','DECLINED')),
  submitted_at     TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by      TEXT,
  reviewed_at      TIMESTAMPTZ,
  review_note      TEXT
);

-- Deletion Requests
CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id              TEXT PRIMARY KEY,
  opportunity_id  TEXT REFERENCES public.opportunities(id) ON DELETE CASCADE,
  requested_by    TEXT,
  reason          TEXT,
  status          TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','DECLINED')),
  requested_at    TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ
);

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  message      TEXT,
  read         BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  related_id   TEXT,
  target_role  TEXT
);

-- Activity Logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id           TEXT PRIMARY KEY,
  action       TEXT NOT NULL,
  user_name    TEXT,
  user_role    TEXT,
  entity_type  TEXT,
  entity_id    TEXT,
  entity_name  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- BD Submissions (BD Tracker)
CREATE TABLE IF NOT EXISTS public.bd_submissions (
  id              BIGSERIAL PRIMARY KEY,
  submitted_on    TEXT,
  solicitation_id TEXT,
  set_aside       TEXT,
  type            TEXT,
  solicitation    TEXT,
  status          TEXT,
  due_date        TEXT,
  local_time      TEXT,
  location        TEXT,
  bdm             TEXT,
  bds             TEXT,
  support_agent   TEXT,
  value           NUMERIC,
  comment         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- Row Level Security (open policies for now — tighten per your auth setup)
-- =====================================================================
ALTER TABLE public.employees              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fresh_awards           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.past_performances      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs          ENABLE ROW LEVEL SECURITY;

-- Permissive read/write for authenticated users (adjust when you add Supabase Auth)
DO $$ DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'employees','users','opportunities','comments','contracts',
    'contract_pocs','locked_subcontractors','government_warnings',
    'fresh_awards','past_performances','subcontractors','subk_database',
    'non_submission_reports','deletion_requests','notifications',
    'activity_logs','bd_submissions'
  ] LOOP
    EXECUTE format('
      CREATE POLICY IF NOT EXISTS "allow_all_%s" ON public.%I
      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
    ', tbl, tbl);
  END LOOP;
END $$;
