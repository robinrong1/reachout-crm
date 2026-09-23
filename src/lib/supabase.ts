import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.ts'

const viteEnv = import.meta.env
export const supabaseUrl = viteEnv?.VITE_SUPABASE_URL ?? ''
export const supabaseAnonKey = viteEnv?.VITE_SUPABASE_ANON_KEY ?? ''
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  console.error(
    JSON.stringify({
      event: 'missing_env',
      missing: [
        !supabaseUrl ? 'VITE_SUPABASE_URL' : null,
        !supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY' : null,
      ].filter(Boolean),
    }),
  )
}

export const supabase = createClient<Database>(
  supabaseUrl || 'https://invalid.supabase.co',
  supabaseAnonKey || 'invalid-anon-key',
)
