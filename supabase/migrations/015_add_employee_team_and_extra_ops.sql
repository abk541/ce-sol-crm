-- 015_add_employee_team_and_extra_ops.sql
-- 1) Promote `team` from a client-only field to a real column on employees
--    so BD vs OPS routing survives DB reloads.
-- 2) Backfill team='OPS' for any existing OPS rows.
-- 3) Insert the full OPS hierarchy (foundational + extras) idempotently so
--    contract assignment can be tested even if MOCK_EMPLOYEES was not seeded
--    on this database.

-- 1) Schema change ────────────────────────────────────────────────────────────
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT 'BD'
    CHECK (team IN ('BD','OPS'));

-- 2) Backfill: any pre-existing emp-ops-* rows get team='OPS' ────────────────
UPDATE public.employees
SET team = 'OPS'
WHERE id LIKE 'emp-ops-%';

-- 3) Insert the OPS hierarchy. ON CONFLICT (id) DO NOTHING makes this safe to
--    re-run; existing rows keep their values. Order matters: managers first,
--    then team leads, then associates, so manager_id FKs resolve.
INSERT INTO public.employees (id, name, email, role, manager_id, avatar, team) VALUES
  -- OPS Managers (top of the OPS tree)
  ('emp-ops-1',  'Sergio Vega',       'sergio.vega@cesolutionplus.com',       'BD_MANAGER', NULL,         'SV', 'OPS'),
  ('emp-ops-2',  'Hannah Boateng',    'hannah.boateng@cesolutionplus.com',    'BD_MANAGER', NULL,         'HB', 'OPS'),

  -- Original OPS Team Leads (under Sergio)
  ('emp-ops-3',  'Diego Rojas',       'diego.rojas@cesolutionplus.com',       'TEAM_LEAD',  'emp-ops-1',  'DR', 'OPS'),
  ('emp-ops-4',  'Asha Banerjee',     'asha.banerjee@cesolutionplus.com',     'TEAM_LEAD',  'emp-ops-1',  'AB', 'OPS'),
  -- Original OPS Team Leads (under Hannah)
  ('emp-ops-5',  'Marek Novak',       'marek.novak@cesolutionplus.com',       'TEAM_LEAD',  'emp-ops-2',  'MN', 'OPS'),
  ('emp-ops-6',  'Talia Greenfield',  'talia.greenfield@cesolutionplus.com',  'TEAM_LEAD',  'emp-ops-2',  'TG', 'OPS'),

  -- New OPS Team Leads (one extra under each manager)
  ('emp-ops-15', 'Adrian Volkov',     'adrian.volkov@cesolutionplus.com',     'TEAM_LEAD',  'emp-ops-1',  'AV', 'OPS'),
  ('emp-ops-16', 'Naima Aboud',       'naima.aboud@cesolutionplus.com',       'TEAM_LEAD',  'emp-ops-2',  'NB', 'OPS'),

  -- Original OPS Associates
  ('emp-ops-7',  'Lucas Romero',      'lucas.romero@cesolutionplus.com',      'ASSOCIATE',  'emp-ops-3',  'LR', 'OPS'),
  ('emp-ops-8',  'Mira Ahmadi',       'mira.ahmadi@cesolutionplus.com',       'ASSOCIATE',  'emp-ops-3',  'MI', 'OPS'),
  ('emp-ops-9',  'Caleb Whitley',     'caleb.whitley@cesolutionplus.com',     'ASSOCIATE',  'emp-ops-4',  'CA', 'OPS'),
  ('emp-ops-10', 'Zara Mahmood',      'zara.mahmood@cesolutionplus.com',      'ASSOCIATE',  'emp-ops-4',  'ZA', 'OPS'),
  ('emp-ops-11', 'Henrik Sorensen',   'henrik.sorensen@cesolutionplus.com',   'ASSOCIATE',  'emp-ops-5',  'HE', 'OPS'),
  ('emp-ops-12', 'Daniela Costa',     'daniela.costa@cesolutionplus.com',     'ASSOCIATE',  'emp-ops-5',  'DC', 'OPS'),
  ('emp-ops-13', 'Owen Maguire',      'owen.maguire@cesolutionplus.com',      'ASSOCIATE',  'emp-ops-6',  'OW', 'OPS'),
  ('emp-ops-14', 'Inez Calderon',     'inez.calderon@cesolutionplus.com',     'ASSOCIATE',  'emp-ops-6',  'IN', 'OPS'),

  -- New OPS Associates (extras for the original Team Leads)
  ('emp-ops-17', 'Jamal Frazier',     'jamal.frazier@cesolutionplus.com',     'ASSOCIATE',  'emp-ops-3',  'JF', 'OPS'),
  ('emp-ops-18', 'Bianca Rinaldi',    'bianca.rinaldi@cesolutionplus.com',    'ASSOCIATE',  'emp-ops-3',  'BR', 'OPS'),
  ('emp-ops-19', 'Kofi Adjei',        'kofi.adjei@cesolutionplus.com',        'ASSOCIATE',  'emp-ops-4',  'KA', 'OPS'),
  ('emp-ops-20', 'Sienna Park',       'sienna.park@cesolutionplus.com',       'ASSOCIATE',  'emp-ops-4',  'SP', 'OPS'),
  ('emp-ops-21', 'Lior Cohen',        'lior.cohen@cesolutionplus.com',        'ASSOCIATE',  'emp-ops-5',  'LC', 'OPS'),
  ('emp-ops-22', 'Priya Iyer',        'priya.iyer@cesolutionplus.com',        'ASSOCIATE',  'emp-ops-5',  'PI', 'OPS'),
  ('emp-ops-23', 'Tomas Aguilar',     'tomas.aguilar@cesolutionplus.com',     'ASSOCIATE',  'emp-ops-6',  'TA', 'OPS'),
  ('emp-ops-24', 'Eleni Markos',      'eleni.markos@cesolutionplus.com',      'ASSOCIATE',  'emp-ops-6',  'EM', 'OPS'),

  -- New OPS Associates under the two newly created Team Leads
  ('emp-ops-25', 'Reed Whitman',      'reed.whitman@cesolutionplus.com',      'ASSOCIATE',  'emp-ops-15', 'RW', 'OPS'),
  ('emp-ops-26', 'Saoirse Devlin',    'saoirse.devlin@cesolutionplus.com',    'ASSOCIATE',  'emp-ops-15', 'SD', 'OPS'),
  ('emp-ops-27', 'Hassan Karam',      'hassan.karam@cesolutionplus.com',      'ASSOCIATE',  'emp-ops-16', 'HK', 'OPS'),
  ('emp-ops-28', 'Anika Volkov',      'anika.volkov@cesolutionplus.com',      'ASSOCIATE',  'emp-ops-16', 'AN', 'OPS')
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
