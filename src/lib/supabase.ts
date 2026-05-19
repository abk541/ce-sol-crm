import { createClient } from '@supabase/supabase-js'

// Supabase anon client config is public in browser apps. These fallbacks keep the
// GitHub Pages build connected even when Actions secrets are not present.
const fallbackSupabaseUrl = 'https://lrwvbilssdmgapmhpebt.supabase.co'
const fallbackSupabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyd3ZiaWxzc2RtZ2FwbWhwZWJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MDYzOTYsImV4cCI6MjA5NDI4MjM5Nn0.cAWZ8nVlCyndF3Ft8HhKVB9ncGzIoXZhFkOoVWGlWoI'

function normalizeSupabaseUrl(value: string | undefined) {
  const trimmed = (value ?? '').trim().replace(/^['"]|['"]$/g, '')
  if (!trimmed) return ''
  return trimmed.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/g, '')
}

function normalizeSupabaseKey(value: string | undefined) {
  let key = (value ?? '').trim().replace(/^['"]|['"]$/g, '')
  const copiedObjectValue = key.match(/value\s*[:=]\s*['"]?([^'"}\s]+)/i)
  if (copiedObjectValue) key = copiedObjectValue[1]
  return key.trim()
}

const supabaseUrl = normalizeSupabaseUrl(
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || fallbackSupabaseUrl,
)
const supabaseAnonKey = normalizeSupabaseKey(
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || fallbackSupabaseAnonKey,
)

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing env vars - running in offline mode')
}

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export const isSupabaseConnected = !!supabase
