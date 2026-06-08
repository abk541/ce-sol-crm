-- 015_add_employee_team_and_extra_ops.sql
-- 1) Promote `team` from a client-only field to a real column on employees
--    so BD vs OPS routing survives DB reloads.
-- 2) Backfill team='OPS' for the 14 OPS people seeded by MOCK_EMPLOYEES.
--    Everyone else stays 'BD' (the column default).
-- 3) Add a second wave of OPS coworkers (2 extra Team Leads + 12 Associates)
--    so contract assignment can be tested with a deeper hierarchy.

-- 1) Schema change ────────────────────────────────────────────────────────────
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT 'BD'
    CHECK (team IN ('BD','OPS'));

-- 2) Backfill existing OPS rows ──────────────────────────────────────────────
UPDATE public.employees
SET team = 'OPS'
WHERE id IN (
  'emp-ops-1','emp-ops-2','emp-ops-3','emp-ops-4','emp-ops-5','emp-ops-6',
  'emp-ops-7','emp-ops-8','emp-ops-9','emp-ops-10','emp-ops-11','emp-ops-12',
  'emp-ops-13','emp-ops-14'
);

-- 3) Insert additional OPS coworkers (idempotent) ────────────────────────────
INSERT INTO public.employees (id, name, email, role, manager_id, avatar, team) VALUES
  -- Two new Team Leads, one under each existing OPS Manager
  ('emp-ops-15', 'Adrian Volkov',     'adrian.volkov@cesolutionplus.com',     'TEAM_LEAD', 'emp-ops-1',  'AV', 'OPS'),
  ('emp-ops-16', 'Naima Aboud',       'naima.aboud@cesolutionplus.com',       'TEAM_LEAD', 'emp-ops-2',  'NB', 'OPS'),

  -- Extra Associates filling out the existing four Team Leads
  ('emp-ops-17', 'Jamal Frazier',     'jamal.frazier@cesolutionplus.com',     'ASSOCIATE', 'emp-ops-3',  'JF', 'OPS'),
  ('emp-ops-18', 'Bianca Rinaldi',    'bianca.rinaldi@cesolutionplus.com',    'ASSOCIATE', 'emp-ops-3',  'BR', 'OPS'),
  ('emp-ops-19', 'Kofi Adjei',        'kofi.adjei@cesolutionplus.com',        'ASSOCIATE', 'emp-ops-4',  'KA', 'OPS'),
  ('emp-ops-20', 'Sienna Park',       'sienna.park@cesolutionplus.com',       'ASSOCIATE', 'emp-ops-4',  'SP', 'OPS'),
  ('emp-ops-21', 'Lior Cohen',        'lior.cohen@cesolutionplus.com',        'ASSOCIATE', 'emp-ops-5',  'LC', 'OPS'),
  ('emp-ops-22', 'Priya Iyer',        'priya.iyer@cesolutionplus.com',        'ASSOCIATE', 'emp-ops-5',  'PI', 'OPS'),
  ('emp-ops-23', 'Tomas Aguilar',     'tomas.aguilar@cesolutionplus.com',     'ASSOCIATE', 'emp-ops-6',  'TA', 'OPS'),
  ('emp-ops-24', 'Eleni Markos',      'eleni.markos@cesolutionplus.com',      'ASSOCIATE', 'emp-ops-6',  'EM', 'OPS'),

  -- Associates under the two newly created Team Leads
  ('emp-ops-25', 'Reed Whitman',      'reed.whitman@cesolutionplus.com',      'ASSOCIATE', 'emp-ops-15', 'RW', 'OPS'),
  ('emp-ops-26', 'Saoirse Devlin',    'saoirse.devlin@cesolutionplus.com',    'ASSOCIATE', 'emp-ops-15', 'SD', 'OPS'),
  ('emp-ops-27', 'Hassan Karam',      'hassan.karam@cesolutionplus.com',      'ASSOCIATE', 'emp-ops-16', 'HK', 'OPS'),
  ('emp-ops-28', 'Anika Volkov',      'anika.volkov@cesolutionplus.com',      'ASSOCIATE', 'emp-ops-16', 'AN', 'OPS')
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
