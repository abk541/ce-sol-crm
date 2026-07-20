import { createClient } from '@supabase/supabase-js'

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

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined)
const supabaseAnonKey = normalizeSupabaseKey(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

if (!supabaseUrl || !supabaseAnonKey)
  console.warn('[Supabase] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.')

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export const isSupabaseConnected = !!supabase

export const supabaseHost = (() => {
  if (!supabaseUrl) return null
  try {
    return new URL(supabaseUrl).host
  } catch {
    return supabaseUrl
  }
})()
