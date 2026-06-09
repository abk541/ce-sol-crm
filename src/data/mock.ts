import type {
  User, Opportunity, Contract, BDSubmission,
  Notification, Subcontractor, NonSubmissionReport,
  DeletionRequest, AgentStats, FreshAward, PastPerformance,
  SubkDatabaseEntry, ActivityLog, Employee, CompanyCertification,
  EmployeeRequest,
} from '../types'

export const MOCK_USERS: User[] = [
  { id:'u0', name:'ABK Manager', email:'abk@cesolutionplus.com', username:'abk', role:'CAPTURE_MANAGER', avatar:'AB', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2024-01-01', password:'abk123' },
  { id:'u-capture-manager', name:'Capture Manager', email:'capture.manager@cesolutionplus.com', username:'capture.manager', role:'CAPTURE_MANAGER', avatar:'CM', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-05-28', password:'capture123' },

  // Business Development hierarchy
  { id:'u-bd-manager', name:'Yassine El Amrani', email:'yassine.elamrani@cesolutionplus.com', username:'yassine.elamrani', role:'BD_MANAGER', avatar:'YE', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'bdmanager123', team:'BD', managerId:null },
  { id:'u-bd-manager-2', name:'Salma Bennani', email:'salma.bennani@cesolutionplus.com', username:'salma.bennani', role:'BD_MANAGER', avatar:'SB', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'bdmanager123', team:'BD', managerId:null },
  { id:'u-bd-manager-ma-1', name:'Karim Alaoui', email:'karim.alaoui@cesolutionplus.com', username:'karim.alaoui', role:'BD_MANAGER', avatar:'KA', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'bdmanager123', team:'BD', managerId:null },
  { id:'u-bd-manager-ma-2', name:'Meryem Berrada', email:'meryem.berrada@cesolutionplus.com', username:'meryem.berrada', role:'BD_MANAGER', avatar:'MB', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'bdmanager123', team:'BD', managerId:null },
  { id:'u-bd-team-lead', name:'Mehdi Tazi', email:'mehdi.tazi@cesolutionplus.com', username:'mehdi.tazi', role:'TEAM_LEAD', avatar:'MT', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'teamlead123', team:'BD', managerId:'u-bd-manager' },
  { id:'u-bd-team-lead-2', name:'Nora El Fassi', email:'nora.elfassi@cesolutionplus.com', username:'nora.elfassi', role:'TEAM_LEAD', avatar:'NE', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'teamlead123', team:'BD', managerId:'u-bd-manager' },
  { id:'u-bd-team-lead-3', name:'Hajar Berrada', email:'hajar.berrada@cesolutionplus.com', username:'hajar.berrada', role:'TEAM_LEAD', avatar:'HB', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'teamlead123', team:'BD', managerId:'u-bd-manager-2' },
  { id:'u-bd-team-lead-ma-1', name:'Rachid Bennouna', email:'rachid.bennouna@cesolutionplus.com', username:'rachid.bennouna', role:'TEAM_LEAD', avatar:'RB', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'teamlead123', team:'BD', managerId:'u-bd-manager-ma-1' },
  { id:'u-bd-team-lead-ma-2', name:'Safae Chraibi', email:'safae.chraibi@cesolutionplus.com', username:'safae.chraibi', role:'TEAM_LEAD', avatar:'SC', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'teamlead123', team:'BD', managerId:'u-bd-manager-ma-1' },
  { id:'u-bd-team-lead-ma-3', name:'Imad Zerouali', email:'imad.zerouali@cesolutionplus.com', username:'imad.zerouali', role:'TEAM_LEAD', avatar:'IZ', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'teamlead123', team:'BD', managerId:'u-bd-manager-ma-2' },
  { id:'u-associate', name:'Imane Alaoui', email:'imane.alaoui@cesolutionplus.com', username:'imane.alaoui', role:'ASSOCIATE', avatar:'IA', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead' },
  { id:'u-bd-associate-2', name:'Hamza Idrissi', email:'hamza.idrissi@cesolutionplus.com', username:'hamza.idrissi', role:'ASSOCIATE', avatar:'HI', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead' },
  { id:'u-bd-associate-3', name:'Soukaina Lahlou', email:'soukaina.lahlou@cesolutionplus.com', username:'soukaina.lahlou', role:'ASSOCIATE', avatar:'SL', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead-2' },
  { id:'u-bd-associate-4', name:'Othmane Cherkaoui', email:'othmane.cherkaoui@cesolutionplus.com', username:'othmane.cherkaoui', role:'ASSOCIATE', avatar:'OC', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead-3' },
  { id:'u-bd-associate-ma-1', name:'Leila Rachidi', email:'leila.rachidi@cesolutionplus.com', username:'leila.rachidi', role:'ASSOCIATE', avatar:'LR', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead-ma-1' },
  { id:'u-bd-associate-ma-2', name:'Adam El Mansouri', email:'adam.elmansouri@cesolutionplus.com', username:'adam.elmansouri', role:'ASSOCIATE', avatar:'AE', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead-ma-1' },
  { id:'u-bd-associate-ma-3', name:'Dounia El Kadi', email:'dounia.elkadi@cesolutionplus.com', username:'dounia.elkadi', role:'ASSOCIATE', avatar:'DE', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead-ma-2' },
  { id:'u-bd-associate-ma-4', name:'Sami Bakkali', email:'sami.bakkali@cesolutionplus.com', username:'sami.bakkali', role:'ASSOCIATE', avatar:'SB', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead-ma-2' },
  { id:'u-bd-associate-ma-5', name:'Yasmine Kabbaj', email:'yasmine.kabbaj@cesolutionplus.com', username:'yasmine.kabbaj', role:'ASSOCIATE', avatar:'YK', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead-ma-3' },
  { id:'u-bd-associate-ma-6', name:'Rayan Amrani', email:'rayan.amrani@cesolutionplus.com', username:'rayan.amrani', role:'ASSOCIATE', avatar:'RA', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'associate123', team:'BD', managerId:'u-bd-team-lead-ma-3' },

  // Operations hierarchy
  { id:'u-ops-manager', name:'Karim Belkacem', email:'karim.belkacem@cesolutionplus.com', username:'karim.belkacem', role:'OPS_MANAGER', avatar:'KB', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'opsmanager123', team:'OPS', managerId:null },
  { id:'u-ops-manager-2', name:'Amina Ouazzani', email:'amina.ouazzani@cesolutionplus.com', username:'amina.ouazzani', role:'OPS_MANAGER', avatar:'AO', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'opsmanager123', team:'OPS', managerId:null },
  { id:'u-ops-manager-ma-1', name:'Nabil El Khatib', email:'nabil.elkhatib@cesolutionplus.com', username:'nabil.elkhatib', role:'OPS_MANAGER', avatar:'NE', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'opsmanager123', team:'OPS', managerId:null },
  { id:'u-ops-manager-ma-2', name:'Laila Sekkat', email:'laila.sekkat@cesolutionplus.com', username:'laila.sekkat', role:'OPS_MANAGER', avatar:'LS', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'opsmanager123', team:'OPS', managerId:null },
  { id:'u-ops-team-lead', name:'Rania Benjelloun', email:'rania.benjelloun@cesolutionplus.com', username:'rania.benjelloun', role:'TEAM_LEAD', avatar:'RB', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'opsteamlead123', team:'OPS', managerId:'u-ops-manager' },
  { id:'u-ops-team-lead-2', name:'Anas Skalli', email:'anas.skalli@cesolutionplus.com', username:'anas.skalli', role:'TEAM_LEAD', avatar:'AS', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'opsteamlead123', team:'OPS', managerId:'u-ops-manager' },
  { id:'u-ops-team-lead-3', name:'Youssef Chraibi', email:'youssef.chraibi@cesolutionplus.com', username:'youssef.chraibi', role:'TEAM_LEAD', avatar:'YC', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'opsteamlead123', team:'OPS', managerId:'u-ops-manager-2' },
  { id:'u-ops-team-lead-ma-1', name:'Oumaima Gharbi', email:'oumaima.gharbi@cesolutionplus.com', username:'oumaima.gharbi', role:'TEAM_LEAD', avatar:'OG', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'opsteamlead123', team:'OPS', managerId:'u-ops-manager-ma-1' },
  { id:'u-ops-team-lead-ma-2', name:'Taha Lmrabet', email:'taha.lmrabet@cesolutionplus.com', username:'taha.lmrabet', role:'TEAM_LEAD', avatar:'TL', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'opsteamlead123', team:'OPS', managerId:'u-ops-manager-ma-1' },
  { id:'u-ops-team-lead-ma-3', name:'Siham Zniber', email:'siham.zniber@cesolutionplus.com', username:'siham.zniber', role:'TEAM_LEAD', avatar:'SZ', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'opsteamlead123', team:'OPS', managerId:'u-ops-manager-ma-2' },
  { id:'u-ops-specialist', name:'Nabil Sefrioui', email:'nabil.sefrioui@cesolutionplus.com', username:'nabil.sefrioui', role:'ASSOCIATE', avatar:'NS', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead' },
  { id:'u-ops-specialist-2', name:'Meryem Ait Lahcen', email:'meryem.aitlahcen@cesolutionplus.com', username:'meryem.aitlahcen', role:'ASSOCIATE', avatar:'MA', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead' },
  { id:'u-ops-specialist-3', name:'Sara Bouzidi', email:'sara.bouzidi@cesolutionplus.com', username:'sara.bouzidi', role:'ASSOCIATE', avatar:'SB', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead-2' },
  { id:'u-ops-specialist-4', name:'Bilal Bennis', email:'bilal.bennis@cesolutionplus.com', username:'bilal.bennis', role:'ASSOCIATE', avatar:'BB', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead-3' },
  { id:'u-ops-specialist-ma-1', name:'Hind El Khatib', email:'hind.elkhatib@cesolutionplus.com', username:'hind.elkhatib', role:'ASSOCIATE', avatar:'HE', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead-ma-1' },
  { id:'u-ops-specialist-ma-2', name:'Omar El Ghazi', email:'omar.elghazi@cesolutionplus.com', username:'omar.elghazi', role:'ASSOCIATE', avatar:'OE', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead-ma-1' },
  { id:'u-ops-specialist-ma-3', name:'Mina Bousfiha', email:'mina.bousfiha@cesolutionplus.com', username:'mina.bousfiha', role:'ASSOCIATE', avatar:'MB', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead-ma-2' },
  { id:'u-ops-specialist-ma-4', name:'Ayoub Hariri', email:'ayoub.hariri@cesolutionplus.com', username:'ayoub.hariri', role:'ASSOCIATE', avatar:'AH', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead-ma-2' },
  { id:'u-ops-specialist-ma-5', name:'Ghita El Idrissi', email:'ghita.elidrissi@cesolutionplus.com', username:'ghita.elidrissi', role:'ASSOCIATE', avatar:'GE', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead-ma-3' },
  { id:'u-ops-specialist-ma-6', name:'Reda Fadili', email:'reda.fadili@cesolutionplus.com', username:'reda.fadili', role:'ASSOCIATE', avatar:'RF', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-06-09', password:'contract123', team:'OPS', managerId:'u-ops-team-lead-ma-3' },
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
  { id: 'emp-1',  name: 'James Harrington', email: 'james.harrington@cesolutionplus.com', role: 'BD_MANAGER',         managerId: null,    avatar: 'JA', team: 'BD' },
  { id: 'emp-2',  name: 'Priya Kapoor',     email: 'priya.kapoor@cesolutionplus.com',     role: 'BD_MANAGER',         managerId: null,    avatar: 'PR', team: 'BD' },
  // BD Team Leads under James Harrington
  { id: 'emp-3',  name: 'Marcus Webb',      email: 'marcus.webb@cesolutionplus.com',      role: 'TEAM_LEAD',          managerId: 'emp-1', avatar: 'MA', team: 'BD' },
  { id: 'emp-4',  name: 'Elena Torres',     email: 'elena.torres@cesolutionplus.com',     role: 'TEAM_LEAD',          managerId: 'emp-1', avatar: 'EL', team: 'BD' },
  // BD Team Leads under Priya Kapoor
  { id: 'emp-5',  name: 'David Osei',       email: 'david.osei@cesolutionplus.com',       role: 'TEAM_LEAD',          managerId: 'emp-2', avatar: 'DA', team: 'BD' },
  { id: 'emp-6',  name: 'Rachel Nguyen',    email: 'rachel.nguyen@cesolutionplus.com',    role: 'TEAM_LEAD',          managerId: 'emp-2', avatar: 'RA', team: 'BD' },
  // BD Associates under Marcus Webb
  { id: 'emp-7',  name: 'Kevin Patel',      email: 'kevin.patel@cesolutionplus.com',      role: 'ASSOCIATE',          managerId: 'emp-3', avatar: 'KE', team: 'BD' },
  { id: 'emp-8',  name: 'Aisha Johnson',    email: 'aisha.johnson@cesolutionplus.com',    role: 'ASSOCIATE',          managerId: 'emp-3', avatar: 'AI', team: 'BD' },
  // BD Associates under Elena Torres
  { id: 'emp-9',  name: 'Chris Lawson',     email: 'chris.lawson@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-4', avatar: 'CH', team: 'BD' },
  { id: 'emp-10', name: 'Leila Morita',     email: 'leila.morita@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-4', avatar: 'LE', team: 'BD' },
  // BD Associates under David Osei
  { id: 'emp-11', name: 'Ryan Collins',     email: 'ryan.collins@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-5', avatar: 'RY', team: 'BD' },
  { id: 'emp-12', name: 'Fatima Al-Hassan', email: 'fatima.al-hassan@cesolutionplus.com', role: 'ASSOCIATE',          managerId: 'emp-5', avatar: 'FA', team: 'BD' },
  // BD Associates under Rachel Nguyen
  { id: 'emp-13', name: 'Ben Carter',       email: 'ben.carter@cesolutionplus.com',       role: 'ASSOCIATE',          managerId: 'emp-6', avatar: 'BE', team: 'BD' },
  { id: 'emp-14', name: 'Amara Diallo',     email: 'amara.diallo@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-6', avatar: 'AM', team: 'BD' },
  // BD Associates — extras (managerId references team leads above)
  { id: 'emp-15', name: 'Sophie Reid',      email: 'sophie.reid@cesolutionplus.com',      role: 'ASSOCIATE',          managerId: 'emp-3', avatar: 'SO', team: 'BD' },
  { id: 'emp-16', name: 'Omar Hassan',      email: 'omar.hassan@cesolutionplus.com',      role: 'ASSOCIATE',          managerId: 'emp-3', avatar: 'OM', team: 'BD' },
  { id: 'emp-17', name: 'Tyler Brooks',     email: 'tyler.brooks@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-3', avatar: 'TY', team: 'BD' },
  { id: 'emp-18', name: 'Mei Chen',         email: 'mei.chen@cesolutionplus.com',         role: 'ASSOCIATE',          managerId: 'emp-3', avatar: 'ME', team: 'BD' },
  { id: 'emp-19', name: 'Jordan Lee',       email: 'jordan.lee@cesolutionplus.com',       role: 'ASSOCIATE',          managerId: 'emp-4', avatar: 'JO', team: 'BD' },
  { id: 'emp-20', name: 'Vanessa Price',    email: 'vanessa.price@cesolutionplus.com',    role: 'ASSOCIATE',          managerId: 'emp-4', avatar: 'VA', team: 'BD' },
  { id: 'emp-21', name: 'Samuel Okonkwo',   email: 'samuel.okonkwo@cesolutionplus.com',   role: 'ASSOCIATE',          managerId: 'emp-4', avatar: 'SA', team: 'BD' },
  { id: 'emp-22', name: 'Isabelle Martin',  email: 'isabelle.martin@cesolutionplus.com',  role: 'ASSOCIATE',          managerId: 'emp-4', avatar: 'IS', team: 'BD' },
  { id: 'emp-23', name: 'Nathan Freed',     email: 'nathan.freed@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-5', avatar: 'NA', team: 'BD' },
  { id: 'emp-24', name: 'Alicia Morales',   email: 'alicia.morales@cesolutionplus.com',   role: 'ASSOCIATE',          managerId: 'emp-5', avatar: 'AL', team: 'BD' },
  { id: 'emp-25', name: 'Derek Wilson',     email: 'derek.wilson@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-5', avatar: 'DE', team: 'BD' },
  { id: 'emp-26', name: 'Yuki Tanaka',      email: 'yuki.tanaka@cesolutionplus.com',      role: 'ASSOCIATE',          managerId: 'emp-5', avatar: 'YU', team: 'BD' },
  { id: 'emp-27', name: 'Patrick Rousseau', email: 'patrick.rousseau@cesolutionplus.com', role: 'ASSOCIATE',          managerId: 'emp-6', avatar: 'PA', team: 'BD' },
  { id: 'emp-28', name: 'Nia Scott',        email: 'nia.scott@cesolutionplus.com',        role: 'ASSOCIATE',          managerId: 'emp-6', avatar: 'NI', team: 'BD' },
  { id: 'emp-29', name: 'Felix Adeyemi',    email: 'felix.adeyemi@cesolutionplus.com',    role: 'ASSOCIATE',          managerId: 'emp-6', avatar: 'FE', team: 'BD' },
  { id: 'emp-30', name: 'Chloe Burnet',     email: 'chloe.burnet@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-6', avatar: 'CL', team: 'BD' },

  // ── OPS Team — Operations hierarchy used for active contract assignment ──
  // OPS Managers
  { id: 'emp-ops-1',  name: 'Sergio Vega',      email: 'sergio.vega@cesolutionplus.com',      role: 'BD_MANAGER', managerId: null,         avatar: 'SV', team: 'OPS' },
  { id: 'emp-ops-2',  name: 'Hannah Boateng',   email: 'hannah.boateng@cesolutionplus.com',   role: 'BD_MANAGER', managerId: null,         avatar: 'HB', team: 'OPS' },
  // OPS Team Leads under Sergio Vega
  { id: 'emp-ops-3',  name: 'Diego Rojas',      email: 'diego.rojas@cesolutionplus.com',      role: 'TEAM_LEAD',  managerId: 'emp-ops-1',  avatar: 'DR', team: 'OPS' },
  { id: 'emp-ops-4',  name: 'Asha Banerjee',    email: 'asha.banerjee@cesolutionplus.com',    role: 'TEAM_LEAD',  managerId: 'emp-ops-1',  avatar: 'AB', team: 'OPS' },
  // OPS Team Leads under Hannah Boateng
  { id: 'emp-ops-5',  name: 'Marek Novak',      email: 'marek.novak@cesolutionplus.com',      role: 'TEAM_LEAD',  managerId: 'emp-ops-2',  avatar: 'MN', team: 'OPS' },
  { id: 'emp-ops-6',  name: 'Talia Greenfield', email: 'talia.greenfield@cesolutionplus.com', role: 'TEAM_LEAD',  managerId: 'emp-ops-2',  avatar: 'TG', team: 'OPS' },
  // OPS Associates under Diego Rojas
  { id: 'emp-ops-7',  name: 'Lucas Romero',     email: 'lucas.romero@cesolutionplus.com',     role: 'ASSOCIATE',  managerId: 'emp-ops-3',  avatar: 'LR', team: 'OPS' },
  { id: 'emp-ops-8',  name: 'Mira Ahmadi',      email: 'mira.ahmadi@cesolutionplus.com',      role: 'ASSOCIATE',  managerId: 'emp-ops-3',  avatar: 'MI', team: 'OPS' },
  // OPS Associates under Asha Banerjee
  { id: 'emp-ops-9',  name: 'Caleb Whitley',    email: 'caleb.whitley@cesolutionplus.com',    role: 'ASSOCIATE',  managerId: 'emp-ops-4',  avatar: 'CA', team: 'OPS' },
  { id: 'emp-ops-10', name: 'Zara Mahmood',     email: 'zara.mahmood@cesolutionplus.com',     role: 'ASSOCIATE',  managerId: 'emp-ops-4',  avatar: 'ZA', team: 'OPS' },
  // OPS Associates under Marek Novak
  { id: 'emp-ops-11', name: 'Henrik Sorensen',  email: 'henrik.sorensen@cesolutionplus.com',  role: 'ASSOCIATE',  managerId: 'emp-ops-5',  avatar: 'HE', team: 'OPS' },
  { id: 'emp-ops-12', name: 'Daniela Costa',    email: 'daniela.costa@cesolutionplus.com',    role: 'ASSOCIATE',  managerId: 'emp-ops-5',  avatar: 'DC', team: 'OPS' },
  // OPS Associates under Talia Greenfield
  { id: 'emp-ops-13', name: 'Owen Maguire',     email: 'owen.maguire@cesolutionplus.com',     role: 'ASSOCIATE',  managerId: 'emp-ops-6',  avatar: 'OW', team: 'OPS' },
  { id: 'emp-ops-14', name: 'Inez Calderon',    email: 'inez.calderon@cesolutionplus.com',    role: 'ASSOCIATE',  managerId: 'emp-ops-6',  avatar: 'IN', team: 'OPS' },
]
