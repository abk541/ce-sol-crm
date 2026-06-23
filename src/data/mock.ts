import type {
  User, Opportunity, Contract, BDSubmission,
  Notification, Subcontractor, NonSubmissionReport,
  DeletionRequest, AgentStats, FreshAward, PastPerformance,
  SubkDatabaseEntry, ActivityLog, Employee, CompanyCertification,
  EmployeeRequest,
} from '../types'

export const MOCK_USERS: User[] = [
  { id:'u0', name:'Capture Admin', email:'abk@cesolutionplus.com', username:'abk', role:'CAPTURE_MANAGER', avatar:'CA', status:'active', firstLogin:false, createdAt:'2024-01-01', password:'abk123' },
  { id:'u-capture-manager', name:'Capture Manager', email:'capture.manager@cesolutionplus.com', username:'capture.manager', role:'CAPTURE_MANAGER', avatar:'CM', status:'active', firstLogin:false, createdAt:'2026-05-28', password:'capture123' },

  // Business Development hierarchy
  { id:'u-bd-manager', name:'BD Manager 01', email:'bd.manager.01@cesolutionplus.com', username:'bd.manager.01', role:'BD_MANAGER', avatar:'B1', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'bdmanager123', team:'BD', managerId:null },
  { id:'u-bd-manager-2', name:'BD Manager 02', email:'bd.manager.02@cesolutionplus.com', username:'bd.manager.02', role:'BD_MANAGER', avatar:'B2', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'bdmanager123', team:'BD', managerId:null },
  { id:'u-bd-manager-ma-1', name:'BD Manager 03', email:'bd.manager.03@cesolutionplus.com', username:'bd.manager.03', role:'BD_MANAGER', avatar:'B3', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'bdmanager123', team:'BD', managerId:null },
  { id:'u-bd-manager-ma-2', name:'BD Manager 04', email:'bd.manager.04@cesolutionplus.com', username:'bd.manager.04', role:'BD_MANAGER', avatar:'B4', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'bdmanager123', team:'BD', managerId:null },
  { id:'u-bd-team-lead', name:'BD Team Lead 01', email:'bd.teamlead.01@cesolutionplus.com', username:'bd.teamlead.01', role:'TEAM_LEAD', avatar:'L1', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'teamlead123', team:'BD', managerId:'u-bd-manager' },
  { id:'u-bd-team-lead-2', name:'BD Team Lead 02', email:'bd.teamlead.02@cesolutionplus.com', username:'bd.teamlead.02', role:'TEAM_LEAD', avatar:'L2', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'teamlead123', team:'BD', managerId:'u-bd-manager' },
  { id:'u-bd-team-lead-3', name:'BD Team Lead 03', email:'bd.teamlead.03@cesolutionplus.com', username:'bd.teamlead.03', role:'TEAM_LEAD', avatar:'L3', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'teamlead123', team:'BD', managerId:'u-bd-manager-2' },
  { id:'u-bd-team-lead-ma-1', name:'BD Team Lead 04', email:'bd.teamlead.04@cesolutionplus.com', username:'bd.teamlead.04', role:'TEAM_LEAD', avatar:'L4', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'teamlead123', team:'BD', managerId:'u-bd-manager-ma-1' },
  { id:'u-bd-team-lead-ma-2', name:'BD Team Lead 05', email:'bd.teamlead.05@cesolutionplus.com', username:'bd.teamlead.05', role:'TEAM_LEAD', avatar:'L5', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'teamlead123', team:'BD', managerId:'u-bd-manager-ma-1' },
  { id:'u-bd-team-lead-ma-3', name:'BD Team Lead 06', email:'bd.teamlead.06@cesolutionplus.com', username:'bd.teamlead.06', role:'TEAM_LEAD', avatar:'L6', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'teamlead123', team:'BD', managerId:'u-bd-manager-ma-2' },
  { id:'u-associate', name:'BD Associate 01', email:'bd.associate.01@cesolutionplus.com', username:'bd.associate.01', role:'ASSOCIATE', avatar:'A1', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead' },
  { id:'u-bd-associate-2', name:'BD Associate 02', email:'bd.associate.02@cesolutionplus.com', username:'bd.associate.02', role:'ASSOCIATE', avatar:'A2', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead' },
  { id:'u-bd-associate-3', name:'BD Associate 03', email:'bd.associate.03@cesolutionplus.com', username:'bd.associate.03', role:'ASSOCIATE', avatar:'A3', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead-2' },
  { id:'u-bd-associate-4', name:'BD Associate 04', email:'bd.associate.04@cesolutionplus.com', username:'bd.associate.04', role:'ASSOCIATE', avatar:'A4', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead-3' },
  { id:'u-bd-associate-ma-1', name:'BD Associate 05', email:'bd.associate.05@cesolutionplus.com', username:'bd.associate.05', role:'ASSOCIATE', avatar:'A5', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead-ma-1' },
  { id:'u-bd-associate-ma-2', name:'BD Associate 06', email:'bd.associate.06@cesolutionplus.com', username:'bd.associate.06', role:'ASSOCIATE', avatar:'A6', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead-ma-1' },
  { id:'u-bd-associate-ma-3', name:'BD Associate 07', email:'bd.associate.07@cesolutionplus.com', username:'bd.associate.07', role:'ASSOCIATE', avatar:'A7', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead-ma-2' },
  { id:'u-bd-associate-ma-4', name:'BD Associate 08', email:'bd.associate.08@cesolutionplus.com', username:'bd.associate.08', role:'ASSOCIATE', avatar:'A8', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead-ma-2' },
  { id:'u-bd-associate-ma-5', name:'BD Associate 09', email:'bd.associate.09@cesolutionplus.com', username:'bd.associate.09', role:'ASSOCIATE', avatar:'A9', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead-ma-3' },
  { id:'u-bd-associate-ma-6', name:'BD Associate 10', email:'bd.associate.10@cesolutionplus.com', username:'bd.associate.10', role:'ASSOCIATE', avatar:'A0', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead-ma-3' },

  // Operations hierarchy
  { id:'u-ops-manager', name:'Ops Manager 01', email:'ops.manager.01@cesolutionplus.com', username:'ops.manager.01', role:'OPS_MANAGER', avatar:'O1', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'opsmanager123', team:'OPS', managerId:null },
  { id:'u-ops-manager-2', name:'Ops Manager 02', email:'ops.manager.02@cesolutionplus.com', username:'ops.manager.02', role:'OPS_MANAGER', avatar:'O2', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'opsmanager123', team:'OPS', managerId:null },
  { id:'u-ops-manager-ma-1', name:'Ops Manager 03', email:'ops.manager.03@cesolutionplus.com', username:'ops.manager.03', role:'OPS_MANAGER', avatar:'O3', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'opsmanager123', team:'OPS', managerId:null },
  { id:'u-ops-manager-ma-2', name:'Ops Manager 04', email:'ops.manager.04@cesolutionplus.com', username:'ops.manager.04', role:'OPS_MANAGER', avatar:'O4', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'opsmanager123', team:'OPS', managerId:null },
  { id:'u-ops-team-lead', name:'Ops Team Lead 01', email:'ops.teamlead.01@cesolutionplus.com', username:'ops.teamlead.01', role:'TEAM_LEAD', avatar:'T1', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'opsteamlead123', team:'OPS', managerId:'u-ops-manager' },
  { id:'u-ops-team-lead-2', name:'Ops Team Lead 02', email:'ops.teamlead.02@cesolutionplus.com', username:'ops.teamlead.02', role:'TEAM_LEAD', avatar:'T2', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'opsteamlead123', team:'OPS', managerId:'u-ops-manager' },
  { id:'u-ops-team-lead-3', name:'Ops Team Lead 03', email:'ops.teamlead.03@cesolutionplus.com', username:'ops.teamlead.03', role:'TEAM_LEAD', avatar:'T3', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'opsteamlead123', team:'OPS', managerId:'u-ops-manager-2' },
  { id:'u-ops-team-lead-ma-1', name:'Ops Team Lead 04', email:'ops.teamlead.04@cesolutionplus.com', username:'ops.teamlead.04', role:'TEAM_LEAD', avatar:'T4', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'opsteamlead123', team:'OPS', managerId:'u-ops-manager-ma-1' },
  { id:'u-ops-team-lead-ma-2', name:'Ops Team Lead 05', email:'ops.teamlead.05@cesolutionplus.com', username:'ops.teamlead.05', role:'TEAM_LEAD', avatar:'T5', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'opsteamlead123', team:'OPS', managerId:'u-ops-manager-ma-1' },
  { id:'u-ops-team-lead-ma-3', name:'Ops Team Lead 06', email:'ops.teamlead.06@cesolutionplus.com', username:'ops.teamlead.06', role:'TEAM_LEAD', avatar:'T6', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'opsteamlead123', team:'OPS', managerId:'u-ops-manager-ma-2' },
  { id:'u-ops-specialist', name:'Ops Specialist 01', email:'ops.specialist.01@cesolutionplus.com', username:'ops.specialist.01', role:'ASSOCIATE', avatar:'S1', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead' },
  { id:'u-ops-specialist-2', name:'Ops Specialist 02', email:'ops.specialist.02@cesolutionplus.com', username:'ops.specialist.02', role:'ASSOCIATE', avatar:'S2', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead' },
  { id:'u-ops-specialist-3', name:'Ops Specialist 03', email:'ops.specialist.03@cesolutionplus.com', username:'ops.specialist.03', role:'ASSOCIATE', avatar:'S3', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead-2' },
  { id:'u-ops-specialist-4', name:'Ops Specialist 04', email:'ops.specialist.04@cesolutionplus.com', username:'ops.specialist.04', role:'ASSOCIATE', avatar:'S4', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead-3' },
  { id:'u-ops-specialist-ma-1', name:'Ops Specialist 05', email:'ops.specialist.05@cesolutionplus.com', username:'ops.specialist.05', role:'ASSOCIATE', avatar:'S5', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead-ma-1' },
  { id:'u-ops-specialist-ma-2', name:'Ops Specialist 06', email:'ops.specialist.06@cesolutionplus.com', username:'ops.specialist.06', role:'ASSOCIATE', avatar:'S6', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead-ma-1' },
  { id:'u-ops-specialist-ma-3', name:'Ops Specialist 07', email:'ops.specialist.07@cesolutionplus.com', username:'ops.specialist.07', role:'ASSOCIATE', avatar:'S7', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead-ma-2' },
  { id:'u-ops-specialist-ma-4', name:'Ops Specialist 08', email:'ops.specialist.08@cesolutionplus.com', username:'ops.specialist.08', role:'ASSOCIATE', avatar:'S8', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead-ma-2' },
  { id:'u-ops-specialist-ma-5', name:'Ops Specialist 09', email:'ops.specialist.09@cesolutionplus.com', username:'ops.specialist.09', role:'ASSOCIATE', avatar:'S9', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead-ma-3' },
  { id:'u-ops-specialist-ma-6', name:'Ops Specialist 10', email:'ops.specialist.10@cesolutionplus.com', username:'ops.specialist.10', role:'ASSOCIATE', avatar:'S0', status:'active', firstLogin:false, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead-ma-3' },
]

// ── Empty business data (start from scratch) ───────────────────────────
export const MOCK_SUBCONTRACTORS: Subcontractor[] = []
export const MOCK_NON_SUB_REPORTS: NonSubmissionReport[] = []
export const MOCK_DELETION_REQUESTS: DeletionRequest[] = []
export const MOCK_OPPORTUNITIES: Opportunity[] = []
export const MOCK_CONTRACTS: Contract[] = []
export const MOCK_BD_SUBMISSIONS: BDSubmission[] = []
export const MOCK_NOTIFICATIONS: Notification[] = []
export const MOCK_FRESH_AWARDS: FreshAward[] = []
export const MOCK_PAST_PERFORMANCES: PastPerformance[] = []
export const MOCK_SUBK_DATABASE: SubkDatabaseEntry[] = []
export const MOCK_ACTIVITY_LOGS: ActivityLog[] = []
export const MOCK_COMPANY_CERTIFICATIONS: CompanyCertification[] = []
export const MOCK_EMPLOYEE_REQUESTS: EmployeeRequest[] = []

export const TEAM_STATS: {
  user: string
  initials: string
  role: string
  total: number
  submissions: number
  nonSubmissions: number
  successRate: number
}[] = []

export const AGENT_STATS: AgentStats[] = []

export const ACTIVITY_FEED: { user: string; action: string; time: string }[] = []

export const REVENUE_TREND: { month: string; revenue: number }[] = []

export const SUBMISSIONS_TREND: { month: string; submissions: number; wins: number }[] = []

export const TIMEZONES: Record<string, string> = {
  // US standard time
  'EST': 'America/New_York',   'CST': 'America/Chicago',
  'MST': 'America/Denver',     'PST': 'America/Los_Angeles',
  'AKST': 'America/Anchorage', 'HST': 'Pacific/Honolulu',
  // US daylight time — same IANA zones (which already handle DST automatically),
  // but exposed as distinct dropdown options so SAM.gov-imported deadlines can
  // be labelled with the same abbreviation the SAM.gov UI shows.
  'EDT': 'America/New_York',   'CDT': 'America/Chicago',
  'MDT': 'America/Denver',     'PDT': 'America/Los_Angeles',
  'AKDT': 'America/Anchorage',
  // International
  'KSA': 'Asia/Riyadh',        'AST': 'Asia/Riyadh',
  'GST': 'Asia/Dubai',
  'EET': 'Asia/Amman',         'EEST': 'Asia/Amman',
  'IRT': 'Asia/Tehran',        'IRST': 'Asia/Tehran',
  'GMT': 'Europe/London',      'CET': 'Europe/Paris',
  'BST': 'Europe/London',      'CEST': 'Europe/Paris',
  'IST': 'Asia/Kolkata',       'SGT': 'Asia/Singapore',
  'JST': 'Asia/Tokyo',
  'AEST': 'Australia/Sydney',  'AEDT': 'Australia/Sydney',
  'NZST': 'Pacific/Auckland',  'NZDT': 'Pacific/Auckland',
  'GMT+1': 'Etc/GMT-1',
  // Fixed UTC offsets from SAM.gov responseDeadLine values. These preserve
  // the source deadline offset exactly when SAM.gov does not provide a named
  // timezone abbreviation.
  'UTC-10:00': 'Etc/GMT+10',    'UTC-09:00': 'Etc/GMT+9',
  'UTC-08:00': 'Etc/GMT+8',     'UTC-07:00': 'Etc/GMT+7',
  'UTC-06:00': 'Etc/GMT+6',     'UTC-05:00': 'Etc/GMT+5',
  'UTC-04:00': 'Etc/GMT+4',     'UTC+00:00': 'Etc/GMT',
  'UTC+01:00': 'Etc/GMT-1',     'UTC+02:00': 'Etc/GMT-2',
  'UTC+03:00': 'Etc/GMT-3',
}

// ── Employees (Hierarchy) ─────────────────────────────────────────────
// Two independent hierarchies:
//   • team: 'BD'  — Business Development (used for opportunities / sourcing / proposals)
//   • team: 'OPS' — Operations (used for active contract assignment in Contract Admin)
export const MOCK_EMPLOYEES: Employee[] = [
  // ── BD Team — Managers (top level) ─────────────────────────────────
  { id: 'emp-1',  name: 'BD Manager 01',     email: 'seed.bd.manager.01@cesolutionplus.com',     role: 'BD_MANAGER', managerId: null,    avatar: 'B1', team: 'BD' },
  { id: 'emp-2',  name: 'BD Manager 02',     email: 'seed.bd.manager.02@cesolutionplus.com',     role: 'BD_MANAGER', managerId: null,    avatar: 'B2', team: 'BD' },
  // BD Team Leads under BD Manager 01
  { id: 'emp-3',  name: 'BD Team Lead 01',   email: 'seed.bd.teamlead.01@cesolutionplus.com',    role: 'TEAM_LEAD',  managerId: 'emp-1', avatar: 'L1', team: 'BD' },
  { id: 'emp-4',  name: 'BD Team Lead 02',   email: 'seed.bd.teamlead.02@cesolutionplus.com',    role: 'TEAM_LEAD',  managerId: 'emp-1', avatar: 'L2', team: 'BD' },
  // BD Team Leads under BD Manager 02
  { id: 'emp-5',  name: 'BD Team Lead 03',   email: 'seed.bd.teamlead.03@cesolutionplus.com',    role: 'TEAM_LEAD',  managerId: 'emp-2', avatar: 'L3', team: 'BD' },
  { id: 'emp-6',  name: 'BD Team Lead 04',   email: 'seed.bd.teamlead.04@cesolutionplus.com',    role: 'TEAM_LEAD',  managerId: 'emp-2', avatar: 'L4', team: 'BD' },
  // BD Associates under BD Team Lead 01
  { id: 'emp-7',  name: 'BD Associate 01',   email: 'seed.bd.associate.01@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-3', avatar: 'A1', team: 'BD' },
  { id: 'emp-8',  name: 'BD Associate 02',   email: 'seed.bd.associate.02@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-3', avatar: 'A2', team: 'BD' },
  // BD Associates under BD Team Lead 02
  { id: 'emp-9',  name: 'BD Associate 03',   email: 'seed.bd.associate.03@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-4', avatar: 'A3', team: 'BD' },
  { id: 'emp-10', name: 'BD Associate 04',   email: 'seed.bd.associate.04@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-4', avatar: 'A4', team: 'BD' },
  // BD Associates under BD Team Lead 03
  { id: 'emp-11', name: 'BD Associate 05',   email: 'seed.bd.associate.05@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-5', avatar: 'A5', team: 'BD' },
  { id: 'emp-12', name: 'BD Associate 06',   email: 'seed.bd.associate.06@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-5', avatar: 'A6', team: 'BD' },
  // BD Associates under BD Team Lead 04
  { id: 'emp-13', name: 'BD Associate 07',   email: 'seed.bd.associate.07@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-6', avatar: 'A7', team: 'BD' },
  { id: 'emp-14', name: 'BD Associate 08',   email: 'seed.bd.associate.08@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-6', avatar: 'A8', team: 'BD' },
  // BD Associates — extras (managerId references team leads above)
  { id: 'emp-15', name: 'BD Associate 09',   email: 'seed.bd.associate.09@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-3', avatar: 'A9', team: 'BD' },
  { id: 'emp-16', name: 'BD Associate 10',   email: 'seed.bd.associate.10@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-3', avatar: 'A0', team: 'BD' },
  { id: 'emp-17', name: 'BD Associate 11',   email: 'seed.bd.associate.11@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-3', avatar: 'A1', team: 'BD' },
  { id: 'emp-18', name: 'BD Associate 12',   email: 'seed.bd.associate.12@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-3', avatar: 'A2', team: 'BD' },
  { id: 'emp-19', name: 'BD Associate 13',   email: 'seed.bd.associate.13@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-4', avatar: 'A3', team: 'BD' },
  { id: 'emp-20', name: 'BD Associate 14',   email: 'seed.bd.associate.14@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-4', avatar: 'A4', team: 'BD' },
  { id: 'emp-21', name: 'BD Associate 15',   email: 'seed.bd.associate.15@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-4', avatar: 'A5', team: 'BD' },
  { id: 'emp-22', name: 'BD Associate 16',   email: 'seed.bd.associate.16@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-4', avatar: 'A6', team: 'BD' },
  { id: 'emp-23', name: 'BD Associate 17',   email: 'seed.bd.associate.17@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-5', avatar: 'A7', team: 'BD' },
  { id: 'emp-24', name: 'BD Associate 18',   email: 'seed.bd.associate.18@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-5', avatar: 'A8', team: 'BD' },
  { id: 'emp-25', name: 'BD Associate 19',   email: 'seed.bd.associate.19@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-5', avatar: 'A9', team: 'BD' },
  { id: 'emp-26', name: 'BD Associate 20',   email: 'seed.bd.associate.20@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-5', avatar: 'A0', team: 'BD' },
  { id: 'emp-27', name: 'BD Associate 21',   email: 'seed.bd.associate.21@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-6', avatar: 'A1', team: 'BD' },
  { id: 'emp-28', name: 'BD Associate 22',   email: 'seed.bd.associate.22@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-6', avatar: 'A2', team: 'BD' },
  { id: 'emp-29', name: 'BD Associate 23',   email: 'seed.bd.associate.23@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-6', avatar: 'A3', team: 'BD' },
  { id: 'emp-30', name: 'BD Associate 24',   email: 'seed.bd.associate.24@cesolutionplus.com',   role: 'ASSOCIATE',  managerId: 'emp-6', avatar: 'A4', team: 'BD' },

  // ── OPS Team — Operations hierarchy used for active contract assignment ──
  // OPS Managers
  { id: 'emp-ops-1',  name: 'Ops Manager 01',    email: 'seed.ops.manager.01@cesolutionplus.com',    role: 'BD_MANAGER', managerId: null,         avatar: 'O1', team: 'OPS' },
  { id: 'emp-ops-2',  name: 'Ops Manager 02',    email: 'seed.ops.manager.02@cesolutionplus.com',    role: 'BD_MANAGER', managerId: null,         avatar: 'O2', team: 'OPS' },
  // OPS Team Leads under Ops Manager 01
  { id: 'emp-ops-3',  name: 'Ops Team Lead 01',  email: 'seed.ops.teamlead.01@cesolutionplus.com',   role: 'TEAM_LEAD',  managerId: 'emp-ops-1',  avatar: 'T1', team: 'OPS' },
  { id: 'emp-ops-4',  name: 'Ops Team Lead 02',  email: 'seed.ops.teamlead.02@cesolutionplus.com',   role: 'TEAM_LEAD',  managerId: 'emp-ops-1',  avatar: 'T2', team: 'OPS' },
  // OPS Team Leads under Ops Manager 02
  { id: 'emp-ops-5',  name: 'Ops Team Lead 03',  email: 'seed.ops.teamlead.03@cesolutionplus.com',   role: 'TEAM_LEAD',  managerId: 'emp-ops-2',  avatar: 'T3', team: 'OPS' },
  { id: 'emp-ops-6',  name: 'Ops Team Lead 04',  email: 'seed.ops.teamlead.04@cesolutionplus.com',   role: 'TEAM_LEAD',  managerId: 'emp-ops-2',  avatar: 'T4', team: 'OPS' },
  // OPS Associates under Ops Team Lead 01
  { id: 'emp-ops-7',  name: 'Ops Specialist 01', email: 'seed.ops.specialist.01@cesolutionplus.com', role: 'ASSOCIATE',  managerId: 'emp-ops-3',  avatar: 'S1', team: 'OPS' },
  { id: 'emp-ops-8',  name: 'Ops Specialist 02', email: 'seed.ops.specialist.02@cesolutionplus.com', role: 'ASSOCIATE',  managerId: 'emp-ops-3',  avatar: 'S2', team: 'OPS' },
  // OPS Associates under Ops Team Lead 02
  { id: 'emp-ops-9',  name: 'Ops Specialist 03', email: 'seed.ops.specialist.03@cesolutionplus.com', role: 'ASSOCIATE',  managerId: 'emp-ops-4',  avatar: 'S3', team: 'OPS' },
  { id: 'emp-ops-10', name: 'Ops Specialist 04', email: 'seed.ops.specialist.04@cesolutionplus.com', role: 'ASSOCIATE',  managerId: 'emp-ops-4',  avatar: 'S4', team: 'OPS' },
  // OPS Associates under Ops Team Lead 03
  { id: 'emp-ops-11', name: 'Ops Specialist 05', email: 'seed.ops.specialist.05@cesolutionplus.com', role: 'ASSOCIATE',  managerId: 'emp-ops-5',  avatar: 'S5', team: 'OPS' },
  { id: 'emp-ops-12', name: 'Ops Specialist 06', email: 'seed.ops.specialist.06@cesolutionplus.com', role: 'ASSOCIATE',  managerId: 'emp-ops-5',  avatar: 'S6', team: 'OPS' },
  // OPS Associates under Ops Team Lead 04
  { id: 'emp-ops-13', name: 'Ops Specialist 07', email: 'seed.ops.specialist.07@cesolutionplus.com', role: 'ASSOCIATE',  managerId: 'emp-ops-6',  avatar: 'S7', team: 'OPS' },
  { id: 'emp-ops-14', name: 'Ops Specialist 08', email: 'seed.ops.specialist.08@cesolutionplus.com', role: 'ASSOCIATE',  managerId: 'emp-ops-6',  avatar: 'S8', team: 'OPS' },
]
