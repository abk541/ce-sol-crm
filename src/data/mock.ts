import type {
  User, Opportunity, Contract, BDSubmission,
  Notification, Subcontractor, NonSubmissionReport,
  DeletionRequest, AgentStats, FreshAward, PastPerformance,
  SubkDatabaseEntry, ActivityLog, Employee,
} from '../types'

export const MOCK_USERS: User[] = [
  { id:'u0',  name:'ABK Admin',         email:'abk@cesolutionplus.com', username:'abk',      role:'ADMIN',         avatar:'AB',  status:'active', firstLogin:false, mfaEnabled:true,  createdAt:'2024-01-01', password:'abk123' },
  { id:'u1',  name:'Mehdi El Yaagoubi', email:'mehdi@cesolutionplus.com',    username:'mehdi',    role:'ADMIN',         avatar:'ME',  status:'active', firstLogin:false, mfaEnabled:true,  createdAt:'2023-01-15' },
  { id:'u2',  name:'Nissrine Essahi',   email:'nissrine@cesolutionplus.com', username:'nissrine', role:'BDS',           avatar:'NE',  status:'active', firstLogin:false, mfaEnabled:true,  createdAt:'2023-03-10' },
  { id:'u3',  name:'Mehdi El Ayachi',   email:'mehdia@cesolutionplus.com',   username:'mehdia',   role:'BDS',           avatar:'MEA', status:'active', firstLogin:false, mfaEnabled:true,  createdAt:'2023-03-12' },
  { id:'u4',  name:'Aymane Chhouma',    email:'aymane@cesolutionplus.com',   username:'aymane',   role:'BDM',           avatar:'AC',  status:'active', firstLogin:false, mfaEnabled:true,  createdAt:'2023-02-08' },
  { id:'u5',  name:'Maroua Azelmat',    email:'maroua@cesolutionplus.com',   username:'maroua',   role:'BDS',           avatar:'MA',  status:'active', firstLogin:false, mfaEnabled:false, createdAt:'2023-04-01' },
  { id:'u6',  name:'Mohamed Sirraj',    email:'sirraj@cesolutionplus.com',   username:'sirraj',   role:'BDS',           avatar:'MS',  status:'active', firstLogin:false, mfaEnabled:true,  createdAt:'2023-02-20' },
  { id:'u7',  name:'Oussama Es-sebaly', email:'oussama@cesolutionplus.com',  username:'oussama',  role:'BDS',           avatar:'OE',  status:'active', firstLogin:false, mfaEnabled:true,  createdAt:'2023-05-15' },
  { id:'u8',  name:'Anas Benali',       email:'anas@cesolutionplus.com',     username:'anas',     role:'PM',            avatar:'AN',  status:'active', firstLogin:false, mfaEnabled:true,  createdAt:'2023-01-20' },
  { id:'u9',  name:'Zoubair Khalid',    email:'zoubair@cesolutionplus.com',  username:'zoubair',  role:'SPM',           avatar:'ZK',  status:'active', firstLogin:false, mfaEnabled:true,  createdAt:'2023-01-10' },
  { id:'u10', name:'Mahmoud El Azzabi', email:'mahmoud@cesolutionplus.com',  username:'mahmoud',  role:'PM',            avatar:'MA2', status:'active', firstLogin:false, mfaEnabled:true,  createdAt:'2023-03-05' },
  { id:'u11', name:'Kholoud Rhylane',   email:'kholoud@cesolutionplus.com',  username:'kholoud',  role:'SUPPORT_AGENT', avatar:'KR',  status:'active', firstLogin:true,  mfaEnabled:false, createdAt:'2024-01-08' },
  { id:'u12', name:'Zakaria Farouk',    email:'zakaria@cesolutionplus.com',  username:'zakaria',  role:'BDS',           avatar:'ZF',  status:'active', firstLogin:false, mfaEnabled:true,  createdAt:'2023-06-14' },
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

export const TEAM_STATS = [
  { user:'Mehdi El Yaagoubi', initials:'ME',  role:'BDM', total:0, submissions:0, nonSubmissions:0, successRate:0, goalAchieved:false },
  { user:'Nissrine Essahi',   initials:'NE',  role:'BDS', total:0, submissions:0, nonSubmissions:0, successRate:0, goalAchieved:false },
  { user:'Mehdi El Ayachi',   initials:'MEA', role:'BDS', total:0, submissions:0, nonSubmissions:0, successRate:0, goalAchieved:false },
  { user:'Aymane Chhouma',    initials:'AC',  role:'BDM', total:0, submissions:0, nonSubmissions:0, successRate:0, goalAchieved:false },
  { user:'Maroua Azelmat',    initials:'MA',  role:'BDS', total:0, submissions:0, nonSubmissions:0, successRate:0, goalAchieved:false },
  { user:'Mohamed Sirraj',    initials:'MS',  role:'BDS', total:0, submissions:0, nonSubmissions:0, successRate:0, goalAchieved:false },
  { user:'Oussama Es-sebaly', initials:'OE',  role:'BDS', total:0, submissions:0, nonSubmissions:0, successRate:0, goalAchieved:false },
]

export const AGENT_STATS: AgentStats[] = [
  { username:'mehdi',    name:'Mehdi El Yaagoubi', avatar:'ME',  role:'BDM', submissions:0, wins:0, losses:0, nonSubs:0, active:0, winRate:0, submissionRate:0, score:0, rank:0, goal:10, streak:0 },
  { username:'nissrine', name:'Nissrine Essahi',   avatar:'NE',  role:'BDS', submissions:0, wins:0, losses:0, nonSubs:0, active:0, winRate:0, submissionRate:0, score:0, rank:0, goal:10, streak:0 },
  { username:'mehdia',   name:'Mehdi El Ayachi',   avatar:'MEA', role:'BDS', submissions:0, wins:0, losses:0, nonSubs:0, active:0, winRate:0, submissionRate:0, score:0, rank:0, goal:8,  streak:0 },
  { username:'aymane',   name:'Aymane Chhouma',    avatar:'AC',  role:'BDM', submissions:0, wins:0, losses:0, nonSubs:0, active:0, winRate:0, submissionRate:0, score:0, rank:0, goal:10, streak:0 },
  { username:'maroua',   name:'Maroua Azelmat',    avatar:'MA',  role:'BDS', submissions:0, wins:0, losses:0, nonSubs:0, active:0, winRate:0, submissionRate:0, score:0, rank:0, goal:8,  streak:0 },
  { username:'sirraj',   name:'Mohamed Sirraj',    avatar:'MS',  role:'BDS', submissions:0, wins:0, losses:0, nonSubs:0, active:0, winRate:0, submissionRate:0, score:0, rank:0, goal:8,  streak:0 },
  { username:'oussama',  name:'Oussama Es-sebaly', avatar:'OE',  role:'BDS', submissions:0, wins:0, losses:0, nonSubs:0, active:0, winRate:0, submissionRate:0, score:0, rank:0, goal:5,  streak:0 },
  { username:'abk',      name:'ABK Admin',         avatar:'AB',  role:'ADMIN',submissions:0,wins:0, losses:0, nonSubs:0, active:0, winRate:0, submissionRate:0, score:0, rank:0, goal:0,  streak:0 },
]

export const ACTIVITY_FEED: { user: string; action: string; time: string }[] = []

export const REVENUE_TREND = [
  { month:'Aug', revenue:0 }, { month:'Sep', revenue:0 },
  { month:'Oct', revenue:0 }, { month:'Nov', revenue:0 },
  { month:'Dec', revenue:0 }, { month:'Jan', revenue:0 },
  { month:'Feb', revenue:0 }, { month:'Mar', revenue:0 },
  { month:'Apr', revenue:0 }, { month:'May', revenue:0 },
]

export const SUBMISSIONS_TREND = [
  { month:'Aug', submissions:0, wins:0 }, { month:'Sep', submissions:0, wins:0 },
  { month:'Oct', submissions:0, wins:0 }, { month:'Nov', submissions:0, wins:0 },
  { month:'Dec', submissions:0, wins:0 }, { month:'Jan', submissions:0, wins:0 },
  { month:'Feb', submissions:0, wins:0 }, { month:'Mar', submissions:0, wins:0 },
  { month:'Apr', submissions:0, wins:0 }, { month:'May', submissions:0, wins:0 },
]

export const TIMEZONES: Record<string, string> = {
  'EST': 'America/New_York',   'CST': 'America/Chicago',
  'MST': 'America/Denver',     'PST': 'America/Los_Angeles',
  'HST': 'Pacific/Honolulu',   'AST': 'Asia/Riyadh',
  'EET': 'Asia/Amman',         'IRT': 'Asia/Tehran',
  'GMT': 'Europe/London',      'CET': 'Europe/Paris',
}

// ── Employees (Hierarchy) ─────────────────────────────────────────────
export const MOCK_EMPLOYEES: Employee[] = [
  // Managers (top level)
  { id: 'emp-1',  name: 'James Harrington', email: 'james.harrington@cesolutionplus.com', role: 'MANAGER',            managerId: null,    avatar: 'JA' },
  { id: 'emp-2',  name: 'Priya Kapoor',     email: 'priya.kapoor@cesolutionplus.com',     role: 'MANAGER',            managerId: null,    avatar: 'PR' },
  // Operations Managers under James Harrington
  { id: 'emp-3',  name: 'Marcus Webb',      email: 'marcus.webb@cesolutionplus.com',      role: 'OPERATIONS_MANAGER', managerId: 'emp-1', avatar: 'MA' },
  { id: 'emp-4',  name: 'Elena Torres',     email: 'elena.torres@cesolutionplus.com',     role: 'OPERATIONS_MANAGER', managerId: 'emp-1', avatar: 'EL' },
  // Operations Managers under Priya Kapoor
  { id: 'emp-5',  name: 'David Osei',       email: 'david.osei@cesolutionplus.com',       role: 'OPERATIONS_MANAGER', managerId: 'emp-2', avatar: 'DA' },
  { id: 'emp-6',  name: 'Rachel Nguyen',    email: 'rachel.nguyen@cesolutionplus.com',    role: 'OPERATIONS_MANAGER', managerId: 'emp-2', avatar: 'RA' },
  // Team Managers under Marcus Webb
  { id: 'emp-7',  name: 'Kevin Patel',      email: 'kevin.patel@cesolutionplus.com',      role: 'TEAM_MANAGER',       managerId: 'emp-3', avatar: 'KE' },
  { id: 'emp-8',  name: 'Aisha Johnson',    email: 'aisha.johnson@cesolutionplus.com',    role: 'TEAM_MANAGER',       managerId: 'emp-3', avatar: 'AI' },
  // Team Managers under Elena Torres
  { id: 'emp-9',  name: 'Chris Lawson',     email: 'chris.lawson@cesolutionplus.com',     role: 'TEAM_MANAGER',       managerId: 'emp-4', avatar: 'CH' },
  { id: 'emp-10', name: 'Leila Morita',     email: 'leila.morita@cesolutionplus.com',     role: 'TEAM_MANAGER',       managerId: 'emp-4', avatar: 'LE' },
  // Team Managers under David Osei
  { id: 'emp-11', name: 'Ryan Collins',     email: 'ryan.collins@cesolutionplus.com',     role: 'TEAM_MANAGER',       managerId: 'emp-5', avatar: 'RY' },
  { id: 'emp-12', name: 'Fatima Al-Hassan', email: 'fatima.al-hassan@cesolutionplus.com', role: 'TEAM_MANAGER',       managerId: 'emp-5', avatar: 'FA' },
  // Team Managers under Rachel Nguyen
  { id: 'emp-13', name: 'Ben Carter',       email: 'ben.carter@cesolutionplus.com',       role: 'TEAM_MANAGER',       managerId: 'emp-6', avatar: 'BE' },
  { id: 'emp-14', name: 'Amara Diallo',     email: 'amara.diallo@cesolutionplus.com',     role: 'TEAM_MANAGER',       managerId: 'emp-6', avatar: 'AM' },
  // Associates under Kevin Patel
  { id: 'emp-15', name: 'Sophie Reid',      email: 'sophie.reid@cesolutionplus.com',      role: 'ASSOCIATE',          managerId: 'emp-7', avatar: 'SO' },
  { id: 'emp-16', name: 'Omar Hassan',      email: 'omar.hassan@cesolutionplus.com',      role: 'ASSOCIATE',          managerId: 'emp-7', avatar: 'OM' },
  // Associates under Aisha Johnson
  { id: 'emp-17', name: 'Tyler Brooks',     email: 'tyler.brooks@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-8', avatar: 'TY' },
  { id: 'emp-18', name: 'Mei Chen',         email: 'mei.chen@cesolutionplus.com',         role: 'ASSOCIATE',          managerId: 'emp-8', avatar: 'ME' },
  // Associates under Chris Lawson
  { id: 'emp-19', name: 'Jordan Lee',       email: 'jordan.lee@cesolutionplus.com',       role: 'ASSOCIATE',          managerId: 'emp-9', avatar: 'JO' },
  { id: 'emp-20', name: 'Vanessa Price',    email: 'vanessa.price@cesolutionplus.com',    role: 'ASSOCIATE',          managerId: 'emp-9', avatar: 'VA' },
  // Associates under Leila Morita
  { id: 'emp-21', name: 'Samuel Okonkwo',   email: 'samuel.okonkwo@cesolutionplus.com',   role: 'ASSOCIATE',          managerId: 'emp-10', avatar: 'SA' },
  { id: 'emp-22', name: 'Isabelle Martin',  email: 'isabelle.martin@cesolutionplus.com',  role: 'ASSOCIATE',          managerId: 'emp-10', avatar: 'IS' },
  // Associates under Ryan Collins
  { id: 'emp-23', name: 'Nathan Freed',     email: 'nathan.freed@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-11', avatar: 'NA' },
  { id: 'emp-24', name: 'Alicia Morales',   email: 'alicia.morales@cesolutionplus.com',   role: 'ASSOCIATE',          managerId: 'emp-11', avatar: 'AL' },
  // Associates under Fatima Al-Hassan
  { id: 'emp-25', name: 'Derek Wilson',     email: 'derek.wilson@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-12', avatar: 'DE' },
  { id: 'emp-26', name: 'Yuki Tanaka',      email: 'yuki.tanaka@cesolutionplus.com',      role: 'ASSOCIATE',          managerId: 'emp-12', avatar: 'YU' },
  // Associates under Ben Carter
  { id: 'emp-27', name: 'Patrick Rousseau', email: 'patrick.rousseau@cesolutionplus.com', role: 'ASSOCIATE',          managerId: 'emp-13', avatar: 'PA' },
  { id: 'emp-28', name: 'Nia Scott',        email: 'nia.scott@cesolutionplus.com',        role: 'ASSOCIATE',          managerId: 'emp-13', avatar: 'NI' },
  // Associates under Amara Diallo
  { id: 'emp-29', name: 'Felix Adeyemi',    email: 'felix.adeyemi@cesolutionplus.com',    role: 'ASSOCIATE',          managerId: 'emp-14', avatar: 'FE' },
  { id: 'emp-30', name: 'Chloe Burnet',     email: 'chloe.burnet@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-14', avatar: 'CL' },
]
