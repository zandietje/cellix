import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

/** Supabase client - only created if env vars are configured */
export const supabase: SupabaseClient | null =
  env.SUPABASE_URL && env.SUPABASE_ANON_KEY
    ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
    : null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}
