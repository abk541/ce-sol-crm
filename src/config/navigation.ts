import {
  Bell,
  Building2,
  ClipboardList,
  Database,
  DollarSign,
  FileCheck2,
  FileText,
  GitBranch,
  HeartPulse,
  History,
  LayoutDashboard,
  ListChecks,
  Settings,
  ShieldCheck,
  TrendingUp,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  to: string
  icon: LucideIcon
  label: string
  badge?: boolean
  hiddenForAssociate?: boolean
  topBarLabel?: string
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    label: 'Business Dev',
    items: [
      { to: '/pipeline',          icon: GitBranch,     label: 'Contract Opportunities', topBarLabel: 'General Pipeline' },
      { to: '/proposals',         icon: FileText,      label: 'Assign Opportunities', hiddenForAssociate: true },
      { to: '/bd-tracker',        icon: TrendingUp,    label: 'BD Tracker' },
      { to: '/tracker',           icon: ListChecks,    label: 'Deletion Requests' },
      { to: '/non-submissions',   icon: ClipboardList, label: 'Non-Submissions Report' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/contracts',            icon: FileCheck2, label: 'Contract Admin' },
      { to: '/fresh-award',          icon: Trophy,     label: 'Fresh Awards' },
      { to: '/finance-projections', icon: DollarSign, label: 'Finance Projections' },
    ],
  },
  {
    label: 'Databases',
    items: [
      { to: '/subk-database', icon: Building2, label: 'Subk Database' },
      { to: '/database',      icon: Database,  label: 'INT-Database' },
      { to: '/certifications', icon: ShieldCheck, label: 'Company Certifications' },
      { to: '/past-performances', icon: History, label: 'Past Performances' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/notifications', icon: Bell,       label: 'Notifications', badge: true },
      { to: '/admin',         icon: Users,      label: 'Admin' },
      { to: '/hr',            icon: HeartPulse, label: 'HR' },
      { to: '/settings',      icon: Settings,   label: 'Settings' },
    ],
  },
]

export const DEFAULT_EXPANDED_NAV_GROUPS = NAV_GROUPS.reduce((acc, group) => {
  acc[group.label] = true
  return acc
}, {} as Record<string, boolean>)

export const ROUTE_LABELS = NAV_GROUPS.flatMap(group => group.items).reduce((acc, item) => {
  acc[item.to] = item.topBarLabel ?? item.label
  return acc
}, {} as Record<string, string>)
